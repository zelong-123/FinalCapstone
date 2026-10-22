<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BranchSale extends Model
{
    use HasFactory;

    protected $fillable = [
        'sale_number', 'location_id', 'recorded_by_user_id', 'client_reference', 'notes',
    ];

    public function location(): BelongsTo
    {
        return $this->belongsTo(FranchiseLocation::class, 'location_id');
    }

    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by_user_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(BranchSaleItem::class);
    }

    public function getTotalQuantityAttribute(): int
    {
        return (int) round((float) $this->items->sum('quantity'));
    }
}
