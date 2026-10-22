<?php

namespace App\Services;

use App\Enums\InventoryTransactionType;
use App\Enums\LocationType;
use App\Enums\SupplyRequestStatus;
use App\Models\Delivery;
use App\Models\FranchiseLocation;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\SupplyRequest;
use App\Models\SupplyRequestStatusHistory;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SupplyWorkflowService
{
    public function __construct(
        private readonly InventoryService $inventoryService,
        private readonly NotificationService $notificationService,
    ) {}

    public function transition(SupplyRequest $request, SupplyRequestStatus $to, User $actor, ?string $remarks = null): SupplyRequest
    {
        $from = $request->status;
        $allowed = $this->allowedTransitions($from);

        if (! in_array($to, $allowed, true)) {
            throw ValidationException::withMessages([
                'status' => ["Invalid transition from {$from->value} to {$to->value}."],
            ]);
        }

        return DB::transaction(function () use ($request, $from, $to, $actor, $remarks): SupplyRequest {
            $updates = ['status' => $to];

            if ($to === SupplyRequestStatus::UnderReview) {
                $updates['reviewed_by_user_id'] = $actor->id;
                $updates['reviewed_at'] = now();
            }
            if ($to === SupplyRequestStatus::Endorsed) {
                $updates['endorsed_by_user_id'] = $actor->id;
                $updates['endorsed_at'] = now();
            }
            if ($to === SupplyRequestStatus::Completed) {
                $updates['completed_at'] = now();
            }

            $request->update($updates);

            SupplyRequestStatusHistory::create([
                'supply_request_id' => $request->id,
                'from_status' => $from,
                'to_status' => $to,
                'remarks' => $remarks,
                'changed_by_user_id' => $actor->id,
            ]);        if ($to === SupplyRequestStatus::Dispatched) {
            Delivery::query()->updateOrCreate(
                ['supply_request_id' => $request->id],
                ['dispatched_at' => now(), 'delivered_by_user_id' => $actor->id],
            );

            $this->applyDispatchInventoryDeduction($request->fresh(['items', 'location']), $actor);
            $this->dispatchDeductionNotification($request, $actor);
        }

        if ($to === SupplyRequestStatus::Delivered) {
            Delivery::query()->updateOrCreate(
                ['supply_request_id' => $request->id],
                ['delivered_at' => now(), 'delivery_date' => now()->toDateString(), 'delivered_by_user_id' => $actor->id],
            );

            // The moment the delivery is confirmed the branch receives the stock
            // (warehouse was already deducted at the dispatch stage).
            // One delivery = one replenishment: the reference check below keeps the
            // stock from being added twice if a delivery is ever re-confirmed.
            $this->applyDeliveryReplenishment($request->fresh(['items', 'location', 'delivery']), $actor);
        }

            $this->notificationService->notifyUser(
                $request->requested_by_user_id,
                'supply_request_status',
                'Supply request updated',
                "Request {$request->request_number} is now {$to->value}.",
                ['supply_request_id' => $request->id, 'status' => $to->value],
            );

            return $request->fresh(['items.product', 'location', 'statusHistory.changedBy', 'delivery.documents']);
        });
    }

    private function dispatchDeductionNotification(SupplyRequest $request, User $actor): void
    {
        $totalQuantity = (float) $request->items->sum(fn ($item) => (float) ($item->quantity_requested ?? 0));
        $this->notificationService->notifyUser(
            $request->requested_by_user_id,
            'supply_request_dispatched',
            'Supply request dispatched',
            "Order #{$request->request_number} for Branch {$request->location->name} marked as SHIPPED by Logistics. Stock automatically updated: -{$totalQuantity} units deducted from inventory.",
            ['supply_request_id' => $request->id, 'status' => SupplyRequestStatus::Dispatched->value],
        );
    }

    /** @return array<SupplyRequestStatus> */
    private function allowedTransitions(SupplyRequestStatus $from): array
    {
        return match ($from) {
            SupplyRequestStatus::Draft => [SupplyRequestStatus::Submitted, SupplyRequestStatus::Cancelled],
            SupplyRequestStatus::Submitted => [SupplyRequestStatus::UnderReview, SupplyRequestStatus::Rejected, SupplyRequestStatus::Cancelled],
            SupplyRequestStatus::UnderReview => [SupplyRequestStatus::Endorsed, SupplyRequestStatus::Rejected],
            SupplyRequestStatus::Endorsed => [SupplyRequestStatus::Preparing, SupplyRequestStatus::Rejected],
            SupplyRequestStatus::Preparing => [SupplyRequestStatus::Dispatched],
            SupplyRequestStatus::Dispatched => [SupplyRequestStatus::Delivered],
            SupplyRequestStatus::Delivered => [SupplyRequestStatus::Completed],
            default => [],
        };
    }

    /**
     * Apply branch-side stock only once per supply request by looking for a
     * replenishment transaction that already carries this request as reference.
     */
    private function applyDeliveryReplenishment(SupplyRequest $request, User $actor): void
    {
        foreach ($request->items as $item) {
            $quantity = (float) ($item->quantity_fulfilled ?: $item->quantity_requested);

            $destinationInventory = Inventory::query()->firstOrCreate(
                ['location_id' => $request->location_id, 'product_id' => $item->product_id],
                ['current_stock' => 0, 'reorder_level' => 0, 'critical_level' => 0, 'updated_by_user_id' => $actor->id],
            );

            $alreadyReceived = InventoryTransaction::query()
                ->where('inventory_id', $destinationInventory->id)
                ->where('type', InventoryTransactionType::Replenishment)
                ->where('reference_type', SupplyRequest::class)
                ->where('reference_id', $request->id)
                ->exists();

            if (! $alreadyReceived && $quantity > 0) {
                $this->inventoryService->adjust(
                    $destinationInventory,
                    $quantity,
                    InventoryTransactionType::Replenishment,
                    $actor,
                    SupplyRequest::class,
                    $request->id,
                    "Confirmed delivery {$request->request_number}",
                );
            }
        }
    }

    private function applyDispatchInventoryDeduction(SupplyRequest $request, User $actor): void
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

        foreach ($request->items as $item) {
            $quantity = (float) ($item->quantity_requested ?: 0);
            if ((float) ($item->quantity_fulfilled ?? 0) > 0) {
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

            $this->inventoryService->adjust(
                $warehouseInventory,
                -$quantity,
                InventoryTransactionType::Fulfillment,
                $actor,
                SupplyRequest::class,
                $request->id,
                "Dispatched {$request->request_number}",
            );

            $item->update(['quantity_fulfilled' => $quantity]);
        }
    }
}
