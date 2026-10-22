<?php

namespace App\Models;

use App\Enums\SupplyRequestStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplyRequestStatusHistory extends Model
{
    use HasFactory;

    protected $fillable = ['supply_request_id', 'from_status', 'to_status', 'remarks', 'changed_by_user_id'];

    protected function casts(): array
    {
        return [
            'from_status' => SupplyRequestStatus::class,
            'to_status' => SupplyRequestStatus::class,
        ];
    }

    public function supplyRequest(): BelongsTo
    {
        return $this->belongsTo(SupplyRequest::class);
    }

    public function changedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by_user_id');
    }
}
