<?php

namespace App\Services;

use App\Enums\InventoryTransactionType;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InventoryService
{
    public function adjust(
        Inventory $inventory,
        float $delta,
        InventoryTransactionType $type,
        ?User $user,
        ?string $referenceType = null,
        ?int $referenceId = null,
        ?string $remarks = null,
    ): InventoryTransaction {
        return DB::transaction(function () use ($inventory, $delta, $type, $user, $referenceType, $referenceId, $remarks): InventoryTransaction {
            /** @var Inventory $locked */
            $locked = Inventory::query()->lockForUpdate()->findOrFail($inventory->id);
            $before = (float) $locked->current_stock;
            $after = round($before + $delta, 2);

            if ($after < 0) {
                throw ValidationException::withMessages([
                    'quantity' => ['The transaction would make stock negative.'],
                ]);
            }

            $locked->update([
                'current_stock' => $after,
                'last_counted_at' => now(),
                'updated_by_user_id' => $user?->id,
            ]);

            return InventoryTransaction::create([
                'inventory_id' => $locked->id,
                'type' => $type,
                'quantity' => $delta,
                'balance_before' => $before,
                'balance_after' => $after,
                'reference_type' => $referenceType,
                'reference_id' => $referenceId,
                'remarks' => $remarks,
                'recorded_by_user_id' => $user?->id,
                'transaction_date' => now(),
            ]);
        });
    }

    public function setStock(Inventory $inventory, float $newStock, ?User $user, ?string $remarks = null): InventoryTransaction
    {
        if ($newStock < 0) {
            throw ValidationException::withMessages([
                'quantity' => ['Stock cannot be negative.'],
            ]);
        }

        return DB::transaction(function () use ($inventory, $newStock, $user, $remarks): InventoryTransaction {
            /** @var Inventory $locked */
            $locked = Inventory::query()->lockForUpdate()->findOrFail($inventory->id);
            $before = (float) $locked->current_stock;
            $after = round($newStock, 2);
            $delta = round($after - $before, 2);
            $type = $delta >= 0
                ? InventoryTransactionType::AdjustmentIn
                : InventoryTransactionType::AdjustmentOut;

            $locked->update([
                'current_stock' => $after,
                'last_counted_at' => now(),
                'updated_by_user_id' => $user?->id,
            ]);

            return InventoryTransaction::create([
                'inventory_id' => $locked->id,
                'type' => $type,
                'quantity' => $delta,
                'balance_before' => $before,
                'balance_after' => $after,
                'remarks' => $remarks,
                'recorded_by_user_id' => $user?->id,
                'transaction_date' => now(),
            ]);
        });
    }
}
