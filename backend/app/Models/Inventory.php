<?php

namespace App\Models;

use App\Enums\InventoryTransactionType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Carbon\Carbon;

class Inventory extends Model
{
    use HasFactory;

    protected $table = 'inventories';

    protected $fillable = [
        'location_id', 'product_id', 'current_stock', 'reorder_level', 'critical_level',
        'last_counted_at', 'updated_by_user_id',
    ];

    protected $appends = ['stock_status', 'estimated_days_left'];

    protected function casts(): array
    {
        return [
            'current_stock' => 'decimal:2',
            'reorder_level' => 'decimal:2',
            'critical_level' => 'decimal:2',
            'last_counted_at' => 'datetime',
        ];
    }

    public function getStockStatusAttribute(): string
    {
        $stock = (float) $this->current_stock;
        if ($stock <= (float) $this->critical_level) {
            return 'critical';
        }
        if ($stock <= (float) $this->reorder_level) {
            return 'low';
        }

        return 'normal';
    }

    public function getEstimatedDaysLeftAttribute(): ?float
    {
        $consumption = $this->transactions()
            ->where('type', InventoryTransactionType::Consumption->value)
            ->where('transaction_date', '>=', Carbon::now()->subDays(30))
            ->sum('quantity');

        $dailyRate = $consumption / 30;
        if ($dailyRate <= 0) {
            return null;
        }

        $stock = (float) $this->current_stock;
        return max(0, round($stock / $dailyRate, 1));
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(FranchiseLocation::class, 'location_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by_user_id');
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(InventoryTransaction::class);
    }

    public function getStatusColor(): string
    {
        return match ($this->stock_status) {
            'critical' => '#f43f5e',
            'low' => '#f59e0b',
            default => '#10b981',
        };
    }
}
