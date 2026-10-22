<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\DocumentType;
use App\Enums\InventoryTransactionType;
use App\Enums\LocationType;
use App\Enums\RoleName;
use App\Enums\SupplyRequestStatus;
use App\Models\Delivery;
use App\Models\Document;
use App\Models\FranchiseLocation;
use App\Models\SupplyRequest;
use App\Models\SupplyRequestStatusHistory;
use App\Services\AuditService;
use App\Services\NotificationService;
use App\Services\SupplyWorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use App\Models\Inventory;

class SupplyRequestController extends ApiController
{
    /**
     * Small KPI snapshot for the supply request workspace (and the logistics
     * dashboard): pipeline counts, overdue shipments, and completion volume.
     */
    public function stats(Request $request): JsonResponse
    {
        $query = SupplyRequest::query();
        $this->scopeForUser($request, $query);

        $byStatus = [];
        foreach (SupplyRequestStatus::cases() as $status) {
            $byStatus[$status->value] = (clone $query)->where('status', $status)->count();
        }

        $openStatuses = [
            SupplyRequestStatus::Submitted->value,
            SupplyRequestStatus::UnderReview->value,
            SupplyRequestStatus::Endorsed->value,
            SupplyRequestStatus::Preparing->value,
            SupplyRequestStatus::Dispatched->value,
        ];

        $overdue = (clone $query)
            ->whereIn('status', $openStatuses)
            ->whereNotNull('target_delivery_date')
            ->whereDate('target_delivery_date', '<', now()->toDateString())
            ->count();

        $completedThisMonth = (clone $query)
            ->where('status', SupplyRequestStatus::Completed)
            ->whereBetween('completed_at', [now()->startOfMonth(), now()])
            ->count();

        $avgFulfillmentDays = (float) ((clone $query)
            ->where('status', SupplyRequestStatus::Completed)
            ->whereNotNull('completed_at')
            ->selectRaw('avg(datediff(completed_at, created_at)) as days')
            ->value('days') ?? 0);

        return $this->success([
            'total' => array_sum($byStatus),
            'by_status' => $byStatus,
            'active' => collect($byStatus)->only($openStatuses)->sum(),
            'overdue' => $overdue,
            'completed_this_month' => $completedThisMonth,
            'avg_fulfillment_days' => round($avgFulfillmentDays, 1),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $query = SupplyRequest::query()->with(['location.brand', 'requestedBy:id,full_name', 'items.product', 'delivery.documents']);
        $this->scopeForUser($request, $query);

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        if ($request->filled('location_id')) {
            $query->where('location_id', $request->integer('location_id'));
        }
        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->date('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->date('to'));
        }
        if ($request->filled('search')) {
            $term = '%'.$request->string('search').'%';
            $query->where('request_number', 'like', $term);
        }

        return $this->paginated($query->latest()->paginate($this->perPage($request, 20)));
    }

    public function store(Request $request, NotificationService $notifications, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'location_id' => ['required', 'exists:franchise_locations,id'],
            'submit' => ['nullable', 'boolean'],
            'target_delivery_date' => ['nullable', 'date', 'after_or_equal:today'],
            'delivery_address' => ['required', 'string'],
            'remarks' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'distinct', 'exists:products,id'],
            'items.*.quantity_requested' => ['required', 'integer', 'min:1'],
        ]);

        $location = FranchiseLocation::findOrFail($validated['location_id']);
        if ($request->user()->role->name === RoleName::Franchisee) {
            $owns = $location->franchisee()->where('user_id', $request->user()->id)->exists();
            abort_unless($owns, 403, 'You can only request supplies for your own location.');
        }

        $status = ($validated['submit'] ?? true) ? SupplyRequestStatus::Submitted : SupplyRequestStatus::Draft;
        $supplyRequest = DB::transaction(function () use ($request, $validated, $status): SupplyRequest {
            $supplyRequest = SupplyRequest::create([
                'request_number' => $this->generateRequestNumber(),
                'location_id' => $validated['location_id'],
                'requested_by_user_id' => $request->user()->id,
                'status' => $status,
                'target_delivery_date' => $validated['target_delivery_date'] ?? null,
                'delivery_address' => $validated['delivery_address'],
                'remarks' => $validated['remarks'] ?? null,
            ]);

            $supplyRequest->items()->createMany($validated['items']);
            SupplyRequestStatusHistory::create([
                'supply_request_id' => $supplyRequest->id,
                'from_status' => null,
                'to_status' => $status,
                'remarks' => $status === SupplyRequestStatus::Submitted ? 'Request submitted.' : 'Draft request created.',
                'changed_by_user_id' => $request->user()->id,
            ]);

            return $supplyRequest;
        });

        if ($status === SupplyRequestStatus::Submitted) {
            $notifications->notifyRoles(['admin', 'sales'], 'supply_request_submitted', 'New supply request', "{$supplyRequest->request_number} requires review.", ['supply_request_id' => $supplyRequest->id]);
        }
        $audit->record('supply_request.created', $supplyRequest, newValues: $supplyRequest->load('items')->toArray(), request: $request);

        return $this->success($supplyRequest->load(['location.brand', 'items.product', 'statusHistory.changedBy:id,full_name']), 'Supply request created.', 201);
    }

    public function show(Request $request, SupplyRequest $supplyRequest): JsonResponse
    {
        $this->assertAccess($request, $supplyRequest);

        return $this->success($supplyRequest->load([
            'location.brand', 'location.franchisee.user:id,full_name,email', 'requestedBy:id,full_name,email',
            'reviewedBy:id,full_name', 'endorsedBy:id,full_name', 'items.product.brand',
            'statusHistory.changedBy:id,full_name', 'delivery.documents.uploadedBy:id,full_name',
        ]));
    }

    public function updateDraft(Request $request, SupplyRequest $supplyRequest, AuditService $audit): JsonResponse
    {
        $this->assertAccess($request, $supplyRequest);
        if ($supplyRequest->status !== SupplyRequestStatus::Draft) {
            throw ValidationException::withMessages(['status' => ['Only draft requests can be edited.']]);
        }

        $validated = $request->validate([
            'target_delivery_date' => ['nullable', 'date', 'after_or_equal:today'],
            'delivery_address' => ['sometimes', 'required', 'string'],
            'remarks' => ['nullable', 'string'],
            'items' => ['sometimes', 'array', 'min:1'],
            'items.*.product_id' => ['required_with:items', 'distinct', 'exists:products,id'],
            'items.*.quantity_requested' => ['required_with:items', 'integer', 'min:1'],
        ]);

        $old = $supplyRequest->load('items')->toArray();
        DB::transaction(function () use ($supplyRequest, $validated): void {
            $supplyRequest->update(collect($validated)->except('items')->all());
            if (isset($validated['items'])) {
                $supplyRequest->items()->delete();
                $supplyRequest->items()->createMany($validated['items']);
            }
        });
        $audit->record('supply_request.draft_updated', $supplyRequest, $old, $supplyRequest->fresh('items')->toArray(), $request);

        return $this->success($supplyRequest->fresh(['items.product', 'location']), 'Draft request updated.');
    }

    public function availability(Request $request, SupplyRequest $supplyRequest): JsonResponse
    {
        $this->assertAccess($request, $supplyRequest);

        return $this->success($this->availabilityData($supplyRequest));
    }

    public function transition(
        Request $request,
        SupplyRequest $supplyRequest,
        SupplyWorkflowService $workflow,
        NotificationService $notifications,
        AuditService $audit,
    ): JsonResponse {
        $this->assertAccess($request, $supplyRequest);
        $validated = $request->validate([
            'status' => ['required', Rule::enum(SupplyRequestStatus::class)],
            'remarks' => ['nullable', 'string'],
        ]);
        $to = SupplyRequestStatus::from($validated['status']);
        $role = $request->user()->role->name;

        $this->assertTransitionRole($role, $to, $supplyRequest, $request->user()->id);            if ($to === SupplyRequestStatus::Endorsed) {
            $availability = $this->availabilityData($supplyRequest);
            if (! $availability['all_available']) {
                throw ValidationException::withMessages(['inventory' => ['The request cannot be endorsed because one or more items have insufficient warehouse stock.']]);
            }
        }

        $oldStatus = $supplyRequest->status->value;
        $result = $workflow->transition($supplyRequest, $to, $request->user(), $validated['remarks'] ?? null);

        if ($to === SupplyRequestStatus::Endorsed) {
            $notifications->notifyRoles(['logistics'], 'supply_request_endorsed', 'Supply request endorsed', "{$supplyRequest->request_number} is ready for fulfillment.", ['supply_request_id' => $supplyRequest->id]);
        }
        $audit->record('supply_request.status_changed', $supplyRequest, ['status' => $oldStatus], ['status' => $to->value], $request);

        return $this->success($result, 'Supply request status updated.');
    }

    public function uploadPod(Request $request, SupplyRequest $supplyRequest, AuditService $audit): JsonResponse
    {
        if (! in_array($supplyRequest->status, [SupplyRequestStatus::Dispatched, SupplyRequestStatus::Delivered, SupplyRequestStatus::Completed], true)) {
            throw ValidationException::withMessages(['status' => ['Proof of delivery can only be uploaded after dispatch.']]);
        }
        $validated = $request->validate([
            'file' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:'.config('franchise.max_upload_kb')],
            'recipient_name' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
        ]);

        $delivery = Delivery::query()->updateOrCreate(
            ['supply_request_id' => $supplyRequest->id],
            [
                'delivery_date' => now()->toDateString(),
                'delivered_by_user_id' => $request->user()->id,
                'recipient_name' => $validated['recipient_name'] ?? null,
                'notes' => $validated['notes'] ?? null,
            ],
        );

        $file = $validated['file'];
        $storedName = str()->uuid().'.'.$file->getClientOriginalExtension();
        $path = $file->storeAs("supply-requests/{$supplyRequest->id}/pod", $storedName, 'private');
        $document = $delivery->documents()->create([
            'type' => DocumentType::Pod,
            'original_name' => $file->getClientOriginalName(),
            'stored_name' => $storedName,
            'disk' => 'private',
            'path' => $path,
            'mime_type' => $file->getMimeType(),
            'size_bytes' => $file->getSize(),
            'uploaded_by_user_id' => $request->user()->id,
        ]);

        $audit->record('delivery.pod_uploaded', $delivery, newValues: ['document_id' => $document->id], request: $request);

        return $this->success($document, 'Proof of delivery uploaded.', 201);
    }

    public function acknowledge(Request $request, SupplyRequest $supplyRequest, AuditService $audit): JsonResponse
    {
        $this->assertAccess($request, $supplyRequest);
        if (! in_array($supplyRequest->status, [SupplyRequestStatus::Delivered, SupplyRequestStatus::Completed], true)) {
            throw ValidationException::withMessages(['status' => ['The delivery cannot be acknowledged yet.']]);
        }
        $validated = $request->validate([
            'recipient_name' => ['required', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
        ]);

        $delivery = Delivery::query()->updateOrCreate(
            ['supply_request_id' => $supplyRequest->id],
            [
                'recipient_name' => $validated['recipient_name'],
                'acknowledged_at' => now(),
                'notes' => $validated['notes'] ?? null,
            ],
        );
        $audit->record('delivery.acknowledged', $delivery, newValues: $delivery->toArray(), request: $request);

        return $this->success($delivery, 'Receipt of supplies acknowledged.');
    }

    public function downloadDocument(Request $request, SupplyRequest $supplyRequest, Document $document)
    {
        $this->assertAccess($request, $supplyRequest);
        $supplyRequest->loadMissing('delivery');
        $deliveryId = $supplyRequest->delivery?->id;
        if ($document->documentable_type !== Delivery::class || $document->documentable_id !== $deliveryId) {
            abort(404);
        }
        abort_unless(Storage::disk($document->disk)->exists($document->path), 404, 'File not found.');

        return Storage::disk($document->disk)->download($document->path, $document->original_name);
    }

    /** @return array{warehouse: FranchiseLocation, items: \Illuminate\Support\Collection<int, array<string, mixed>>, all_available: bool} */
    private function availabilityData(SupplyRequest $supplyRequest): array
    {
        $warehouse = FranchiseLocation::query()
            ->where('type', LocationType::Warehouse->value)
            ->where('is_active', true)
            ->first();

        if (! $warehouse) {
            throw ValidationException::withMessages([
                'warehouse' => ['No active warehouse location is configured.'],
            ]);
        }

        $items = $supplyRequest->load('items.product')->items->map(function ($item) use ($warehouse): array {
            $stock = (float) (Inventory::query()
                ->where('location_id', $warehouse->id)
                ->where('product_id', $item->product_id)
                ->value('current_stock') ?? 0);
            $requested = (float) $item->quantity_requested;

            return [
                'product_id' => $item->product_id,
                'product_name' => $item->product->name,
                'requested' => $requested,
                'warehouse_stock' => $stock,
                'available' => $stock >= $requested,
                'shortage' => max(0, $requested - $stock),
            ];
        });

        return [
            'warehouse' => $warehouse,
            'items' => $items,
            'all_available' => $items->every(fn (array $item): bool => $item['available']),
        ];
    }

    private function generateRequestNumber(): string
    {
        do {
            $number = 'FT-'.now()->format('Ymd').'-'.strtoupper(str()->random(6));
        } while (SupplyRequest::query()->where('request_number', $number)->exists());

        return $number;
    }

    private function assertTransitionRole(RoleName $role, SupplyRequestStatus $to, SupplyRequest $supplyRequest, int $actorId): void
    {
        $allowed = match ($role) {
            RoleName::Franchisee => [SupplyRequestStatus::Submitted, SupplyRequestStatus::Cancelled],
            RoleName::Admin => [SupplyRequestStatus::Submitted, SupplyRequestStatus::Cancelled, SupplyRequestStatus::UnderReview, SupplyRequestStatus::Endorsed, SupplyRequestStatus::Rejected],
            RoleName::Sales => [SupplyRequestStatus::UnderReview, SupplyRequestStatus::Endorsed, SupplyRequestStatus::Rejected],
            RoleName::Logistics => [SupplyRequestStatus::Preparing, SupplyRequestStatus::Dispatched, SupplyRequestStatus::Delivered, SupplyRequestStatus::Completed],
            default => [],
        };

        abort_unless(in_array($to, $allowed, true), 403, 'Your role cannot perform this supply request transition.');

        if ($role === RoleName::Franchisee && $supplyRequest->requested_by_user_id !== $actorId) {
            abort(403);
        }
    }

    private function assertAccess(Request $request, SupplyRequest $supplyRequest): void
    {
        if ($request->user()->role->name !== RoleName::Franchisee) {
            return;
        }
        abort_unless($supplyRequest->requested_by_user_id === $request->user()->id, 403, 'You cannot access this supply request.');
    }

    private function scopeForUser(Request $request, $query): void
    {
        if ($request->user()->role->name === RoleName::Franchisee) {
            $query->where('requested_by_user_id', $request->user()->id);
        }
    }

    private function dispatchInventoryDeduction(SupplyRequest $supplyRequest, \App\Models\User $actor): void
    {
        $warehouse = FranchiseLocation::query()
            ->where('type', LocationType::Warehouse->value)
            ->where('is_active', true)
            ->first();

        if (! $warehouse) {
            throw ValidationException::withMessages([
                'inventory' => ['No active warehouse location is configured.'],
            ]);
        }

        foreach ($supplyRequest->items as $item) {
            if ((float) ($item->quantity_fulfilled ?: 0) > 0) {
                continue;
            }

            $warehouseInventory = Inventory::query()
                ->where('location_id', $warehouse->id)
                ->where('product_id', $item->product_id)
                ->first();

            if (! $warehouseInventory) {
                throw ValidationException::withMessages([
                    'inventory' => ["Warehouse inventory is missing for product {$item->product_id}."],
                ]);
            }

            InventoryTransaction::create([
                'inventory_id' => $warehouseInventory->id,
                'type' => InventoryTransactionType::Fulfillment,
                'quantity' => -(float) $item->quantity_requested,
                'balance_before' => (float) $warehouseInventory->current_stock,
                'balance_after' => (float) $warehouseInventory->current_stock - (float) $item->quantity_requested,
                'reference_type' => SupplyRequest::class,
                'reference_id' => $supplyRequest->id,
                'remarks' => "Dispatched {$supplyRequest->request_number}",
                'recorded_by_user_id' => $actor->id,
                'transaction_date' => now(),
            ]);

            $warehouseInventory->update([
                'current_stock' => (float) $warehouseInventory->current_stock - (float) $item->quantity_requested,
            ]);

            $item->update(['quantity_fulfilled' => $item->quantity_requested]);
        }
    }
}
