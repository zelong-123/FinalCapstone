<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplyRequestItem extends Model
{
    use HasFactory;

    protected $fillable = ['supply_request_id', 'product_id', 'quantity_requested', 'quantity_fulfilled'];

    protected function casts(): array
    {
        return [
            'quantity_requested' => 'decimal:2',
            'quantity_fulfilled' => 'decimal:2',
        ];
    }

    public function supplyRequest(): BelongsTo
    {
        return $this->belongsTo(SupplyRequest::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
