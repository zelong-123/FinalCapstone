<?php

namespace App\Models;

use App\Enums\SupplyRequestStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class SupplyRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'request_number', 'location_id', 'requested_by_user_id', 'status', 'target_delivery_date',
        'delivery_address', 'remarks', 'reviewed_by_user_id', 'reviewed_at',
        'endorsed_by_user_id', 'endorsed_at', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'status' => SupplyRequestStatus::class,
            'target_delivery_date' => 'date',
            'reviewed_at' => 'datetime',
            'endorsed_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(FranchiseLocation::class, 'location_id');
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by_user_id');
    }

    public function endorsedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'endorsed_by_user_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(SupplyRequestItem::class);
    }

    public function statusHistory(): HasMany
    {
        return $this->hasMany(SupplyRequestStatusHistory::class);
    }

    public function delivery(): HasOne
    {
        return $this->hasOne(Delivery::class);
    }
}
