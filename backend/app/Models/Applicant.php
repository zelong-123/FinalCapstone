<?php

namespace App\Models;

use App\Enums\ApplicantStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Applicant extends Model
{
    use HasFactory;

    protected $fillable = [
        'inquiry_id', 'user_id', 'preferred_brand_id', 'full_name', 'email', 'phone',
        'address', 'status', 'application_date', 'approved_at', 'rejected_at', 'notes',
        'milestones', 'milestone_details', 'archived_at', 'archived_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'status' => ApplicantStatus::class,
            'application_date' => 'date',
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
            'milestones' => 'array',
            'milestone_details' => 'array',
            'archived_at' => 'datetime',
        ];
    }

    protected $appends = ['progress'];

    /**
     * Pipeline default: archived applicants stay out of every operational query.
     */
    public function scopeActive($query)
    {
        return $query->whereNull('archived_at');
    }

    public function scopeArchived($query)
    {
        return $query->whereNotNull('archived_at');
    }

    public function archivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by_user_id');
    }

    /**
     * Merge the stored checklist with the canonical milestone keys so the update
     * form always renders every item, completed or not.
     *
     * @return array<int, array{key: string, label: string, completed: bool}>
     */
    public function milestoneState(): array
    {
        $stored = $this->milestones ?? [];

        return collect(config('franchise.milestones', []))
            ->map(fn (string $label, string $key) => [
                'key' => $key,
                'label' => $label,
                'completed' => (bool) ($stored[$key] ?? false),
            ])
            ->values()
            ->all();
    }

    /**
     * Progress indicator combining pipeline stage and milestone completion.
     */
    public function getProgressAttribute(): array
    {
        $milestones = $this->milestoneState();
        $completed = count(array_filter($milestones, fn (array $item) => $item['completed']));
        $milestonePercent = $milestones === [] ? 0 : (int) round(($completed / count($milestones)) * 100);

        $stages = [
            ApplicantStatus::Inquiry, ApplicantStatus::Qualified, ApplicantStatus::Scheduled,
            ApplicantStatus::LoiSubmitted, ApplicantStatus::PaymentSubmitted,
            ApplicantStatus::ForApproval, ApplicantStatus::Approved, ApplicantStatus::ActiveFranchisee,
        ];
        $position = array_search($this->status, $stages, true);
        $stagePercent = $position === false ? 0 : (int) round((($position + 1) / count($stages)) * 100);

        $closed = in_array($this->status, [ApplicantStatus::Approved, ApplicantStatus::ActiveFranchisee], true);
        $rejected = $this->status === ApplicantStatus::Rejected;

        return [
            'milestones_completed' => $completed,
            'milestones_total' => count($milestones),
            'milestone_percent' => $milestonePercent,
            'stage_percent' => $stagePercent,
            'percent' => $rejected ? $milestonePercent : max($milestonePercent, $closed ? 100 : $stagePercent),
            'state' => $rejected ? 'rejected' : ($closed ? 'complete' : ($milestonePercent === 100 ? 'ready' : 'in_progress')),
        ];
    }

    public function inquiry(): BelongsTo
    {
        return $this->belongsTo(FranchiseInquiry::class, 'inquiry_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function preferredBrand(): BelongsTo
    {
        return $this->belongsTo(Brand::class, 'preferred_brand_id');
    }

    public function statusHistory(): HasMany
    {
        return $this->hasMany(ApplicantStatusHistory::class);
    }

    public function schedules(): HasMany
    {
        return $this->hasMany(ActivitySchedule::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function documents(): MorphMany
    {
        return $this->morphMany(Document::class, 'documentable');
    }

    public function franchisee(): HasOne
    {
        return $this->hasOne(Franchisee::class);
    }
}
