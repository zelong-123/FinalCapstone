<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\InventoryTransactionType;
use App\Enums\RoleName;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Services\AuditService;
use App\Services\InventoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class InventoryController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $query = Inventory::query()->with(['location.brand', 'location.franchisee.user:id,full_name,email', 'product.brand']);
        $this->scopeForUser($request, $query);

        if ($request->filled('location_id')) {
            $query->where('location_id', $request->integer('location_id'));
        }
        if ($request->filled('location_type') && $request->user()->role->name !== RoleName::Franchisee) {
            $query->whereHas('location', fn ($q) => $q->where('type', $request->string('location_type')->toString()));
        }
        if ($request->filled('product_id')) {
            $query->where('product_id', $request->integer('product_id'));
        }
        if ($request->filled('brand_id')) {
            $query->whereHas('product', fn ($q) => $q->where('brand_id', $request->integer('brand_id')));
        }
        if ($request->filled('stock_status')) {
            $status = $request->string('stock_status')->toString();
            $query->where(function ($q) use ($status): void {
                if ($status === 'critical') {
                    $q->whereColumn('current_stock', '<=', 'critical_level');
                } elseif ($status === 'low') {
                    $q->whereColumn('current_stock', '>', 'critical_level')->whereColumn('current_stock', '<=', 'reorder_level');
                } elseif ($status === 'normal') {
                    $q->whereColumn('current_stock', '>', 'reorder_level');
                }
            });
        }

        return $this->paginated($query->orderBy('location_id')->orderBy('product_id')->paginate($this->perPage($request, 50)));
    }

    public function show(Request $request, Inventory $inventory): JsonResponse
    {
        $this->assertAccess($request, $inventory);

        return $this->success($inventory->load([
            'location.brand', 'location.franchisee.user:id,full_name,email', 'product.brand',
            'transactions' => fn ($q) => $q->latest('transaction_date')->limit(100),
        ]));
    }

    public function store(Request $request, InventoryService $inventoryService, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'location_id' => ['required', 'exists:franchise_locations,id'],
            'product_id' => ['required', 'exists:products,id'],
            'current_stock' => ['nullable', 'integer', 'min:0'],
            'reorder_level' => ['required', 'integer', 'min:0'],
            'critical_level' => ['required', 'integer', 'min:0', 'lte:reorder_level'],
        ]);

        $inventory = Inventory::query()->firstOrCreate(
            ['location_id' => $validated['location_id'], 'product_id' => $validated['product_id']],
            [
                'current_stock' => 0,
                'reorder_level' => $validated['reorder_level'],
                'critical_level' => $validated['critical_level'],
                'updated_by_user_id' => $request->user()->id,
            ],
        );

        $inventory->update([
            'reorder_level' => $validated['reorder_level'],
            'critical_level' => $validated['critical_level'],
            'updated_by_user_id' => $request->user()->id,
        ]);

        if (array_key_exists('current_stock', $validated) && (float) $validated['current_stock'] !== (float) $inventory->current_stock) {
            $inventoryService->setStock($inventory, (float) $validated['current_stock'], $request->user(), 'Initial or corrected stock count.');
        }

        $audit->record('inventory.configured', $inventory, newValues: $inventory->fresh()->toArray(), request: $request);

        return $this->success($inventory->fresh(['location', 'product']), 'Inventory record configured.', 201);
    }

    public function updateThresholds(Request $request, Inventory $inventory, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'reorder_level' => ['required', 'integer', 'min:0'],
            'critical_level' => ['required', 'integer', 'min:0', 'lte:reorder_level'],
        ]);
        $old = $inventory->only(['reorder_level', 'critical_level']);
        $inventory->update([...$validated, 'updated_by_user_id' => $request->user()->id]);
        $audit->record('inventory.thresholds_updated', $inventory, $old, $inventory->fresh()->only(['reorder_level', 'critical_level']), $request);

        return $this->success($inventory->fresh(), 'Inventory thresholds updated.');
    }

    public function adjust(Request $request, Inventory $inventory, InventoryService $inventoryService, AuditService $audit): JsonResponse
    {
        $this->assertAccess($request, $inventory);
        $validated = $request->validate([
            'mode' => ['required', Rule::in(['delta', 'set'])],
            'quantity' => ['required', 'integer'],
            'type' => ['nullable', Rule::enum(InventoryTransactionType::class)],
            'remarks' => ['nullable', 'string'],
        ]);

        if ($validated['mode'] === 'set') {
            $request->validate(['quantity' => ['min:0']]);
            $transaction = $inventoryService->setStock($inventory, (float) $validated['quantity'], $request->user(), $validated['remarks'] ?? null);
        } else {
            $request->validate(['quantity' => ['not_in:0']]);
            $type = isset($validated['type'])
                ? InventoryTransactionType::from($validated['type'])
                : ((float) $validated['quantity'] >= 0 ? InventoryTransactionType::AdjustmentIn : InventoryTransactionType::AdjustmentOut);
            $transaction = $inventoryService->adjust($inventory, (float) $validated['quantity'], $type, $request->user(), remarks: $validated['remarks'] ?? null);
        }

        $audit->record('inventory.adjusted', $inventory, newValues: ['transaction_id' => $transaction->id, 'balance_after' => $transaction->balance_after], request: $request);

        return $this->success($transaction->load(['inventory.product', 'inventory.location']), 'Inventory updated.');
    }

    public function transactions(Request $request): JsonResponse
    {
        $query = InventoryTransaction::query()->with(['inventory.product', 'inventory.location', 'recordedBy:id,full_name']);
        $this->scopeForUser($request, $query, relation: 'inventory.location');

        if ($request->filled('inventory_id')) {
            $query->where('inventory_id', $request->integer('inventory_id'));
        }
        if ($request->filled('type')) {
            $query->where('type', $request->string('type'));
        }
        if ($request->filled('from')) {
            $query->where('transaction_date', '>=', $request->date('from')->startOfDay());
        }
        if ($request->filled('to')) {
            $query->where('transaction_date', '<=', $request->date('to')->endOfDay());
        }

        return $this->paginated($query->latest('transaction_date')->paginate($this->perPage($request, 50)));
    }

    private function assertAccess(Request $request, Inventory $inventory): void
    {
        if ($request->user()->role->name !== RoleName::Franchisee) {
            return;
        }

        $owns = $inventory->location()->whereHas('franchisee', fn ($q) => $q->where('user_id', $request->user()->id))->exists();
        abort_unless($owns, 403, 'You cannot access this inventory record.');
    }

    private function scopeForUser(Request $request, $query, string $relation = 'location'): void
    {
        if ($request->user()->role->name !== RoleName::Franchisee) {
            return;
        }

        $query->whereHas($relation, fn ($q) => $q->whereHas('franchisee', fn ($f) => $f->where('user_id', $request->user()->id)));
    }
}
