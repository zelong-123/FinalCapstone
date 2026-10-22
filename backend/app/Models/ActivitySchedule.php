<?php

namespace App\Models;

use App\Enums\ActivityStatus;
use App\Enums\ActivityType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ActivitySchedule extends Model
{
    use HasFactory;

    protected $fillable = [
        'applicant_id', 'activity_type', 'title', 'starts_at', 'ends_at', 'duration_minutes', 'venue',
        'status', 'assigned_to_user_id', 'scheduled_by_user_id', 'participants',
        'result_notes', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'activity_type' => ActivityType::class,
            'status' => ActivityStatus::class,
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'duration_minutes' => 'integer',
            'participants' => 'array',
            'completed_at' => 'datetime',
        ];
    }

    /**
     * Normalise the participant list: drop blanks and remove repeated names so the
     * same person can never be listed twice on a single activity.
     *
     * @param  array<int, mixed>  $participants
     * @return array<int, string>
     */
    public static function normalizeParticipants(array $participants): array
    {
        $seen = [];
        $clean = [];

        foreach ($participants as $participant) {
            $name = trim((string) $participant);
            if ($name === '') {
                continue;
            }
            $key = mb_strtolower($name);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $clean[] = $name;
        }

        return $clean;
    }

    /**
     * Every person attached to this activity: the assigned staff member first,
     * then any additional participants.
     *
     * @return array<int, string>
     */
    public function people(): array
    {
        $people = [];
        if ($this->assignedTo?->full_name) {
            $people[] = $this->assignedTo->full_name;
        }

        return self::normalizeParticipants([...$people, ...($this->participants ?? [])]);
    }

    public function applicant(): BelongsTo
    {
        return $this->belongsTo(Applicant::class);
    }

    public function assignedTo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to_user_id');
    }

    public function scheduledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'scheduled_by_user_id');
    }
}
