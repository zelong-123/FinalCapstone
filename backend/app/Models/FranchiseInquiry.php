<?php

namespace App\Models;

use App\Enums\InquiryStatus;
use App\Enums\RoleName;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\DB;

class FranchiseInquiry extends Model
{
    use HasFactory;

    protected $fillable = [
        'lead_name', 'first_name', 'last_name', 'email', 'phone', 'viber_number',
        'address', 'current_city', 'preferred_franchise_location',
        'source', 'preferred_brand_id',
        'status', 'remarks', 'encoded_by_user_id', 'endorsed_to_user_id', 'inquiry_date',
        'archived_at', 'archived_by_user_id', 'converted_from_status',
    ];

    protected function casts(): array
    {
        return [
            'status' => InquiryStatus::class,
            'inquiry_date' => 'date',
            'archived_at' => 'datetime',
            'display_no' => 'integer', // only present when the list query selects it
        ];
    }

    public function scopeActive($query)
    {
        return $query->whereNull('archived_at');
    }

    public function scopeArchived($query)
    {
        return $query->whereNotNull('archived_at');
    }

    /**
     * Who may see which inquiry.
     * - Everyone sees the inquiries they encoded themselves.
     * - Admin and Sales also see inquiries that were endorsed TO them.
     * - Marketing therefore only ever sees its own entries, and an inquiry encoded by
     *   Marketing stays out of Admin's list until it is endorsed to Admin.
     * $table lets the scope be reused on an aliased table (see InquiryController::index).
     */
    public function scopeVisibleTo($query, User $user, string $table = 'franchise_inquiries')
    {
        $receivesEndorsements = in_array($user->role?->name, [RoleName::Admin, RoleName::Sales], true);

        return $query->where(function ($q) use ($user, $table, $receivesEndorsements) {
            $q->where("{$table}.encoded_by_user_id", $user->id);

            if ($receivesEndorsements) {
                $q->orWhere("{$table}.endorsed_to_user_id", $user->id);
            }
        });
    }

    public function archivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by_user_id');
    }

    public function preferredBrand(): BelongsTo
    {
        return $this->belongsTo(Brand::class, 'preferred_brand_id');
    }

    public function encodedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'encoded_by_user_id');
    }

    public function endorsedTo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'endorsed_to_user_id');
    }

    public function applicant(): HasOne
    {
        return $this->hasOne(Applicant::class, 'inquiry_id');
    }

    public function archiveLogs(): HasMany
    {
        return $this->hasMany(InquiryArchiveLog::class, 'franchise_inquiry_id');
    }

    /** The archive event that is still open (the inquiry has not been restored since). */
    public function currentArchiveLog(): HasOne
    {
        return $this->hasOne(InquiryArchiveLog::class, 'franchise_inquiry_id')
            ->whereNull('restored_at')
            ->latest('id');
    }

    /**
     * Archive this inquiry and write its history row in one transaction.
     * The permanent id never changes; the displayed number is derived, not stored,
     * so we only remember what it was at the moment of archiving.
     */
    public function archiveBy(int $userId): ?InquiryArchiveLog
    {
        if ($this->archived_at) {
            return null;
        }

        return DB::transaction(function () use ($userId): InquiryArchiveLog {
            // Position among active inquiries (by entry order) just before archiving.
            $displayNo = static::query()->active()->where('id', '<=', $this->id)->count();
            $now = now();

            $this->update(['archived_at' => $now, 'archived_by_user_id' => $userId]);

            $log = InquiryArchiveLog::create([
                'franchise_inquiry_id' => $this->id,
                'lead_name' => $this->lead_name,
                'original_display_no' => $displayNo,
                'archived_by_user_id' => $userId,
                'archived_at' => $now,
            ]);
            // 5-digit, collision-free by construction (one per log row): 10001, 10002, ...
            $log->update(['archive_id' => 10000 + $log->id]);

            return $log;
        });
    }

    /** Return this inquiry to the active list and close its open archive history row. */
    public function restoreBy(int $userId): void
    {
        DB::transaction(function () use ($userId): void {
            $this->update(['archived_at' => null, 'archived_by_user_id' => null]);

            InquiryArchiveLog::query()
                ->where('franchise_inquiry_id', $this->id)
                ->whereNull('restored_at')
                ->update(['restored_at' => now(), 'restored_by_user_id' => $userId]);
        });
    }
}
