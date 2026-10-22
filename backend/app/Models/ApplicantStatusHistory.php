<?php

namespace App\Models;

use App\Enums\ApplicantStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApplicantStatusHistory extends Model
{
    use HasFactory;

    protected $fillable = ['applicant_id', 'from_status', 'to_status', 'remarks', 'changed_by_user_id'];

    protected function casts(): array
    {
        return [
            'from_status' => ApplicantStatus::class,
            'to_status' => ApplicantStatus::class,
        ];
    }

    public function applicant(): BelongsTo
    {
        return $this->belongsTo(Applicant::class);
    }

    public function changedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by_user_id');
    }
}
