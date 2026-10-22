<?php

namespace App\Models;

use App\Enums\LocationType;
use App\Enums\SupplyRequestStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FranchiseLocation extends Model
{
    use HasFactory;

    protected $fillable = [
        'franchisee_id', 'brand_id', 'name', 'branch_code', 'type', 'address', 'city', 'province',
        'region', 'contact_number', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'type' => LocationType::class,
            'is_active' => 'boolean',
        ];
    }

    public function franchisee(): BelongsTo
    {
        return $this->belongsTo(Franchisee::class);
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function inventories(): HasMany
    {
        return $this->hasMany(Inventory::class, 'location_id');
    }

    public function supplyRequests(): HasMany
    {
        return $this->hasMany(SupplyRequest::class, 'location_id');
    }

    public function sales(): HasMany
    {
        return $this->hasMany(BranchSale::class, 'location_id');
    }

    public function getLowStockCountAttribute(): int
    {
        return $this->inventories->where('stock_status', 'low')->count();
    }

    public function getCriticalStockCountAttribute(): int
    {
        return $this->inventories->where('stock_status', 'critical')->count();
    }

    public function getTotalUnitsAttribute(): int
    {
        return (int) round((float) $this->inventories->sum('current_stock'));
    }

    public function getOpenRequestCountAttribute(): int
    {
        return $this->supplyRequests()
            ->whereIn('status', [
                SupplyRequestStatus::Draft->value,
                SupplyRequestStatus::Submitted->value,
                SupplyRequestStatus::UnderReview->value,
                SupplyRequestStatus::Endorsed->value,
                SupplyRequestStatus::Preparing->value,
                SupplyRequestStatus::Dispatched->value,
            ])
            ->count();
    }

    public function getLastDeliveryAttribute(): ?Delivery
    {
        $delivered = $this->supplyRequests()
            ->with('delivery')
            ->get()
            ->filter(fn (SupplyRequest $request) => $request->delivery?->delivered_at);

        if ($delivered->isEmpty()) {
            return null;
        }

        $latest = $delivered->sortByDesc(fn (SupplyRequest $request) => $request->delivery->delivered_at)->first();

        return $latest?->delivery;
    }

    public function getNextDeliveryTargetAttribute(): ?string
    {
        return $this->supplyRequests()
            ->whereIn('status', [SupplyRequestStatus::Dispatched->value, SupplyRequestStatus::Delivered->value])
            ->orderBy('target_delivery_date', 'asc')
            ->value('target_delivery_date');
    }
}
