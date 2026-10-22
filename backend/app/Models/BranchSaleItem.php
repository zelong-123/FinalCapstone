<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BranchSaleItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'branch_sale_id', 'inventory_id', 'product_id', 'inventory_transaction_id',
        'quantity', 'balance_before', 'balance_after',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:2',
            'balance_before' => 'decimal:2',
            'balance_after' => 'decimal:2',
        ];
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(BranchSale::class, 'branch_sale_id');
    }

    public function inventory(): BelongsTo
    {
        return $this->belongsTo(Inventory::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function inventoryTransaction(): BelongsTo
    {
        return $this->belongsTo(InventoryTransaction::class);
    }
}
