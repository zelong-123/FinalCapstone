<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Forecast extends Model
{
    use HasFactory;

    protected $fillable = [
        'inventory_id', 'method', 'period_start', 'period_end', 'periods_used',
        'predicted_quantity', 'recommended_reorder_quantity', 'input_series',
        'generated_by_user_id', 'generated_at',
    ];

    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end' => 'date',
            'predicted_quantity' => 'decimal:2',
            'recommended_reorder_quantity' => 'decimal:2',
            'input_series' => 'array',
            'generated_at' => 'datetime',
        ];
    }

    public function inventory(): BelongsTo
    {
        return $this->belongsTo(Inventory::class);
    }

    public function generatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'generated_by_user_id');
    }
}
