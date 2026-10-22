<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Franchisee extends Model
{
    use HasFactory;

    protected $fillable = [
        'applicant_id', 'user_id', 'business_name', 'franchise_status', 'approval_date',
    ];

    protected function casts(): array
    {
        return ['approval_date' => 'date'];
    }

    public function applicant(): BelongsTo
    {
        return $this->belongsTo(Applicant::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function locations(): HasMany
    {
        return $this->hasMany(FranchiseLocation::class);
    }
}
