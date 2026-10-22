<?php

namespace App\Services;

use App\Enums\ActivityStatus;
use App\Models\ActivitySchedule;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

class ScheduleService
{
    /**
     * Resolve the activity window from a start time plus either a duration or an
     * explicit end time. Duration is preferred so the admin never has to pick a
     * second date and time.
     *
     * @return array{starts_at: CarbonInterface, ends_at: CarbonInterface, duration_minutes: int}
     */
    public function resolveWindow(CarbonInterface $startsAt, ?int $durationMinutes, ?string $endsAt): array
    {
        $endsAt = $endsAt ? Carbon::parse($endsAt) : null;

        if ($durationMinutes !== null && $durationMinutes > 0) {
            $endsAt = $startsAt->copy()->addMinutes($durationMinutes);
        }

        if (! $endsAt) {
            throw ValidationException::withMessages([
                'duration_minutes' => ['Provide either an activity duration or an end time.'],
            ]);
        }

        if ($endsAt->lessThanOrEqualTo($startsAt)) {
            throw ValidationException::withMessages([
                'duration_minutes' => ['The activity duration must be at least 1 minute.'],
            ]);
        }

        return [
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
            'duration_minutes' => (int) round(($endsAt->getTimestamp() - $startsAt->getTimestamp()) / 60),
        ];
    }

    public function assertNoConflict(
        int $applicantId,
        ?int $assignedUserId,
        CarbonInterface $startsAt,
        CarbonInterface $endsAt,
        ?int $ignoreScheduleId = null,
    ): void {
        if ($endsAt->lessThanOrEqualTo($startsAt)) {
            throw ValidationException::withMessages([
                'ends_at' => ['The end time must be after the start time.'],
            ]);
        }

        $query = ActivitySchedule::query()
            ->whereNotIn('status', [ActivityStatus::Cancelled->value, ActivityStatus::Completed->value])
            ->where('starts_at', '<', $endsAt)
            ->where('ends_at', '>', $startsAt)
            ->when($ignoreScheduleId, fn ($q) => $q->whereKeyNot($ignoreScheduleId));

        $applicantConflict = (clone $query)->where('applicant_id', $applicantId)->exists();
        $staffConflict = $assignedUserId !== null
            && (clone $query)->where('assigned_to_user_id', $assignedUserId)->exists();

        if ($applicantConflict || $staffConflict) {
            throw ValidationException::withMessages([
                'starts_at' => ['The selected schedule conflicts with an existing applicant or staff activity.'],
            ]);
        }
    }

    /**
     * Reject an activity that duplicates one already booked for the same person at
     * the same time, so the schedule cannot accumulate duplicate or spam entries.
     */
    public function assertNoDuplicate(
        int $applicantId,
        string $title,
        CarbonInterface $startsAt,
        ?int $ignoreScheduleId = null,
    ): void {
        $exists = ActivitySchedule::query()
            ->where('applicant_id', $applicantId)
            ->where('title', $title)
            ->where('starts_at', $startsAt)
            ->where('status', '!=', ActivityStatus::Cancelled->value)
            ->when($ignoreScheduleId, fn ($q) => $q->whereKeyNot($ignoreScheduleId))
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'title' => ['This person already has an activity with the same title at this time.'],
            ]);
        }
    }
}