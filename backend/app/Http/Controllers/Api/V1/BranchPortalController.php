<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\InventoryTransactionType;
use App\Enums\LocationType;
use App\Enums\RoleName;
use App\Models\BranchSale;
use App\Models\FranchiseLocation;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Product;
use App\Services\AuditService;
use App\Services\InventoryService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BranchPortalController extends ApiController
{
    public function context(Request $request): JsonResponse
    {
        $location = $this->resolveLocation($request);
        $products = Product::query()
            ->with('brand')
            ->where('is_active', true)
            ->when($location->brand_id, fn ($query) => $query->where('brand_id', $location->brand_id))
            ->orderBy('name')
            ->get();

        return $this->success([
            'branch_code' => $location->branch_code,
            'location' => $location->loadMissing(['brand', 'franchisee.user:id,full_name,email']),
            'user' => $request->user()->loadMissing('role'),
            'available_products' => $products,
            'sync' => $this->syncData($location),
        ]);
    }

    public function inventory(Request $request): JsonResponse
    {
        $location = $this->resolveLocation($request);
        $inventory = Inventory::query()
            ->with(['product.brand'])
            ->withMax('transactions', 'id')
            ->where('location_id', $location->id)
            ->orderBy('product_id')
            ->get();

        return $this->success([
            'location' => $location->loadMissing('brand'),
            'inventory' => $inventory,
            'sync' => $this->syncData($location),
        ]);
    }

    public function recentSales(Request $request): JsonResponse
    {
        $location = $this->resolveLocation($request);
        $sales = BranchSale::query()
            ->with(['items.product:id,sku,name,unit', 'recordedBy:id,full_name'])
            ->where('location_id', $location->id)
            ->latest()
            ->limit(30)
            ->get();

        return $this->success($sales);
    }

    public function recordSale(
        Request $request,
        InventoryService $inventoryService,
        NotificationService $notifications,
        AuditService $audit,
    ): JsonResponse {
        $location = $this->resolveLocation($request);
        $validated = $request->validate([
            'client_reference' => ['required', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.inventory_id' => ['required', 'integer', 'distinct', 'exists:inventories,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
        ]);

        $result = DB::transaction(function () use ($request, $location, $validated, $inventoryService): array {
            $sale = BranchSale::query()->createOrFirst(
                [
                    'location_id' => $location->id,
                    'client_reference' => $validated['client_reference'],
                ],
                [
                    'sale_number' => $this->generateSaleNumber(),
                    'recorded_by_user_id' => $request->user()->id,
                    'notes' => $validated['notes'] ?? null,
                ],
            );

            if (! $sale->wasRecentlyCreated) {
                return [
                    'sale' => $sale->load(['items.product', 'recordedBy:id,full_name', 'location']),
                    'duplicate' => true,
                ];
            }

            $requestedItems = collect($validated['items'])->sortBy('inventory_id')->values();
            $inventoryIds = $requestedItems->pluck('inventory_id')->map(fn ($id) => (int) $id)->all();
            $inventories = Inventory::query()
                ->with('product')
                ->where('location_id', $location->id)
                ->whereIn('id', $inventoryIds)
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            if ($inventories->count() !== count($inventoryIds)) {
                throw ValidationException::withMessages([
                    'items' => ['One or more selected items do not belong to this branch. Refresh the page and try again.'],
                ]);
            }

            foreach ($requestedItems as $item) {
                $inventory = $inventories->get((int) $item['inventory_id']);
                $quantity = (int) $item['quantity'];
                if ($quantity <= 0) {
                    throw ValidationException::withMessages([
                        'items' => ["The quantity for {$inventory->product->name} must be at least 1 whole unit."],
                    ]);
                }
                if (((float) $inventory->current_stock - $quantity) < 0) {
                    throw ValidationException::withMessages([
                        'items' => ["Insufficient stock for {$inventory->product->name}. Available: {$inventory->current_stock}."],
                    ]);
                }
            }

            foreach ($requestedItems as $item) {
                $inventory = $inventories->get((int) $item['inventory_id']);
                $quantity = (int) $item['quantity'];
                $transaction = $inventoryService->adjust(
                    $inventory,
                    -$quantity,
                    InventoryTransactionType::Consumption,
                    $request->user(),
                    BranchSale::class,
                    $sale->id,
                    "Branch deduction {$sale->sale_number}",
                );

                $sale->items()->create([
                    'inventory_id' => $inventory->id,
                    'product_id' => $inventory->product_id,
                    'inventory_transaction_id' => $transaction->id,
                    'quantity' => $quantity,
                    'balance_before' => $transaction->balance_before,
                    'balance_after' => $transaction->balance_after,
                ]);
            }

            return [
                'sale' => $sale->load(['items.product', 'recordedBy:id,full_name', 'location']),
                'duplicate' => false,
            ];
        }, 3);

        if (! $result['duplicate']) {
            $lowItems = $result['sale']->items->filter(function ($item): bool {
                $inventory = Inventory::query()->find($item->inventory_id);
                return $inventory && (float) $item->balance_after <= (float) $inventory->reorder_level;
            });

            if ($lowItems->isNotEmpty()) {
                $names = $lowItems->pluck('product.name')->filter()->join(', ');
                $notifications->notifyRoles(
                    ['admin', 'logistics'],
                    'branch_low_stock',
                    "Low stock at {$location->name}",
                    "The following items reached reorder level after {$result['sale']->sale_number}: {$names}.",
                    ['location_id' => $location->id, 'branch_sale_id' => $result['sale']->id],
                );
            }

            $audit->record(
                'branch.sale_recorded',
                $result['sale'],
                newValues: $result['sale']->toArray(),
                request: $request,
            );
        }

        return $this->success([
            ...$result,
            'sync' => $this->syncData($location),
        ], $result['duplicate'] ? 'This transaction was already recorded; stock was not deducted twice.' : 'Stock deducted successfully.', $result['duplicate'] ? 200 : 201);
    }

    private function resolveLocation(Request $request): FranchiseLocation
    {
        $branchCode = trim((string) $request->query('branch_code', $request->input('branch_code')));
        if ($branchCode === '') {
            throw ValidationException::withMessages(['branch_code' => ['The branch code is required.']]);
        }

        $location = FranchiseLocation::query()
            ->with(['brand', 'franchisee.user:id,full_name,email'])
            ->where('branch_code', $branchCode)
            ->where('type', LocationType::Franchise->value)
            ->where('is_active', true)
            ->first();

        if (! $location) {
            abort(404, 'The requested branch site is not configured.');
        }

        if ($request->user()->role->name === RoleName::Admin) {
            return $location;
        }

        $ownsLocation = $location->franchisee?->user_id === $request->user()->id;
        abort_unless($ownsLocation, 403, 'This account is not assigned to this branch site.');

        return $location;
    }

    /** @return array{version: int, server_time: string, location_updated_at: ?string} */
    private function syncData(FranchiseLocation $location): array
    {
        $version = (int) InventoryTransaction::query()
            ->whereHas('inventory', fn ($query) => $query->where('location_id', $location->id))
            ->max('id');

        return [
            'version' => $version,
            'server_time' => now()->toIso8601String(),
            'location_updated_at' => $location->updated_at?->toIso8601String(),
        ];
    }

    private function generateSaleNumber(): string
    {
        do {
            $number = 'SALE-'.now()->format('Ymd-His').'-'.strtoupper(str()->random(6));
        } while (BranchSale::query()->where('sale_number', $number)->exists());

        return $number;
    }
}
