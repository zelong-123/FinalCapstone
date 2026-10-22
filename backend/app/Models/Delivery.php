<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Delivery extends Model
{
    use HasFactory;

    protected $fillable = [
        'supply_request_id', 'delivery_date', 'dispatched_at', 'delivered_at',
        'delivered_by_user_id', 'recipient_name', 'acknowledged_at', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'delivery_date' => 'date',
            'dispatched_at' => 'datetime',
            'delivered_at' => 'datetime',
            'acknowledged_at' => 'datetime',
        ];
    }

    public function supplyRequest(): BelongsTo
    {
        return $this->belongsTo(SupplyRequest::class);
    }

    public function deliveredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delivered_by_user_id');
    }

    public function documents(): MorphMany
    {
        return $this->morphMany(Document::class, 'documentable');
    }
}
