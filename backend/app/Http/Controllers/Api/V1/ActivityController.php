<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\ActivityStatus;
use App\Enums\ActivityType;
use App\Enums\ApplicantStatus;
use App\Enums\RoleName;
use App\Models\ActivitySchedule;
use App\Models\Applicant;
use App\Models\ApplicantStatusHistory;
use App\Models\User;
use App\Services\AuditService;
use App\Services\NotificationService;
use App\Services\ScheduleService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ActivityController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $query = ActivitySchedule::query()->with([
            'applicant:id,full_name,email,user_id',
            'assignedTo:id,full_name',
            'scheduledBy:id,full_name',
        ]);

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        if ($request->filled('activity_type')) {
            $query->where('activity_type', $request->string('activity_type'));
        }
        if ($request->filled('from')) {
            $query->where('starts_at', '>=', $request->date('from')->startOfDay());
        }
        if ($request->filled('to')) {
            $query->where('starts_at', '<=', $request->date('to')->endOfDay());
        }
        if ($request->filled('assigned_to_user_id')) {
            $query->where('assigned_to_user_id', $request->integer('assigned_to_user_id'));
        }
        if ($request->user()->role->name === RoleName::Franchisee) {
            $query->whereHas('applicant', fn ($q) => $q->where('user_id', $request->user()->id));
        }

        return $this->paginated($query->orderBy('starts_at')->paginate($this->perPage($request, 30)));
    }

    /**
     * Activities grouped per person, so a person with several activities appears
     * once with their own row instead of repeating their name for every entry.
     */
    public function grouped(Request $request): JsonResponse
    {
        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        $query = ActivitySchedule::query()->with([
            'applicant:id,full_name',
            'assignedTo:id,full_name',
            'scheduledBy:id,full_name',
        ]);

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        if ($request->filled('applicant_id')) {
            $query->where('applicant_id', $request->integer('applicant_id'));
        }
        if ($request->filled('from')) {
            $query->where('starts_at', '>=', $request->date('from')->startOfDay());
        }
        if ($request->filled('to')) {
            $query->where('starts_at', '<=', $request->date('to')->endOfDay());
        }
        if ($request->user()->role->name === RoleName::Franchisee) {
            $query->whereHas('applicant', fn ($q) => $q->where('user_id', $request->user()->id));
        }

        $activities = $query->orderBy('starts_at')->get();

        $groups = [];
        foreach ($activities as $activity) {
            foreach ($activity->people() as $person) {
                $key = mb_strtolower($person);
                if (! isset($groups[$key])) {
                    $groups[$key] = [
                        'person' => $person,
                        'total' => 0,
                        'completed' => 0,
                        'upcoming' => 0,
                        'activities' => [],
                    ];
                }
                $groups[$key]['total']++;
                if ($activity->status === ActivityStatus::Completed) {
                    $groups[$key]['completed']++;
                }
                if ($activity->status !== ActivityStatus::Completed
                    && $activity->status !== ActivityStatus::Cancelled
                    && $activity->starts_at->isFuture()) {
                    $groups[$key]['upcoming']++;
                }
                $groups[$key]['activities'][] = $activity;
            }
        }

        return $this->success(array_values($groups));
    }

    public function store(
        Request $request,
        ScheduleService $scheduleService,
        NotificationService $notifications,
        AuditService $audit,
    ): JsonResponse {
        $validated = $request->validate([
            'applicant_id' => ['required', 'exists:applicants,id'],
            'activity_type' => ['required', Rule::enum(ActivityType::class)],
            'title' => ['required', 'string', 'max:255'],
            'starts_at' => ['required', 'date'],
            'duration_minutes' => ['nullable', 'integer', 'min:1', 'max:1440'],
            'ends_at' => ['nullable', 'date'],
            'venue' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', Rule::enum(ActivityStatus::class)],
            'assigned_to_user_id' => ['nullable', 'exists:users,id'],
            'participants' => ['nullable', 'array'],
            'participants.*' => ['nullable', 'string', 'max:255'],
        ]);

        $window = $scheduleService->resolveWindow(
            Carbon::parse($validated['starts_at']),
            isset($validated['duration_minutes']) ? (int) $validated['duration_minutes'] : null,
            $validated['ends_at'] ?? null,
        );
        $participants = ActivitySchedule::normalizeParticipants($validated['participants'] ?? []);

        $scheduleService->assertNoConflict(
            (int) $validated['applicant_id'],
            isset($validated['assigned_to_user_id']) ? (int) $validated['assigned_to_user_id'] : null,
            $window['starts_at'],
            $window['ends_at'],
        );
        $scheduleService->assertNoDuplicate(
            (int) $validated['applicant_id'],
            $validated['title'],
            $window['starts_at'],
        );

        $activity = ActivitySchedule::create([
            ...$validated,
            ...$window,
            'participants' => $participants,
            'status' => $validated['status'] ?? ActivityStatus::Confirmed,
            'scheduled_by_user_id' => $request->user()->id,
        ]);

        $applicant = Applicant::findOrFail($validated['applicant_id']);
        if (! in_array($applicant->status, [ApplicantStatus::Approved, ApplicantStatus::Rejected, ApplicantStatus::ActiveFranchisee], true)) {
            $from = $applicant->status;
            $applicant->update(['status' => ApplicantStatus::Scheduled]);
            ApplicantStatusHistory::create([
                'applicant_id' => $applicant->id,
                'from_status' => $from,
                'to_status' => ApplicantStatus::Scheduled,
                'remarks' => 'Activity scheduled.',
                'changed_by_user_id' => $request->user()->id,
            ]);
        }

        if ($applicant->user_id) {
            $notifications->notifyUser($applicant->user_id, 'schedule_created', 'Activity scheduled', "{$activity->title} is scheduled for {$activity->starts_at->format('M d, Y h:i A')}.", ['activity_id' => $activity->id]);
        }
        $audit->record('activity.created', $activity, newValues: $activity->toArray(), request: $request);

        return $this->success($activity->load(['applicant', 'assignedTo:id,full_name']), 'Activity scheduled.', 201);
    }

    public function show(Request $request, ActivitySchedule $activity): JsonResponse
    {
        $activity->loadMissing('applicant');
        if ($request->user()->role->name === RoleName::Franchisee && $activity->applicant?->user_id !== $request->user()->id) {
            abort(403);
        }

        return $this->success($activity->load(['applicant', 'assignedTo:id,full_name', 'scheduledBy:id,full_name']));
    }

    public function update(
        Request $request,
        ActivitySchedule $activity,
        ScheduleService $scheduleService,
        NotificationService $notifications,
        AuditService $audit,
    ): JsonResponse {
        $validated = $request->validate([
            'activity_type' => ['sometimes', Rule::enum(ActivityType::class)],
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'starts_at' => ['sometimes', 'date'],
            'duration_minutes' => ['nullable', 'integer', 'min:1', 'max:1440'],
            'ends_at' => ['nullable', 'date'],
            'venue' => ['nullable', 'string', 'max:255'],
            'status' => ['sometimes', Rule::enum(ActivityStatus::class)],
            'assigned_to_user_id' => ['nullable', 'exists:users,id'],
            'participants' => ['nullable', 'array'],
            'participants.*' => ['nullable', 'string', 'max:255'],
            'result_notes' => ['nullable', 'string'],
        ]);

        $window = $scheduleService->resolveWindow(
            Carbon::parse($validated['starts_at'] ?? $activity->starts_at),
            array_key_exists('duration_minutes', $validated)
                ? ($validated['duration_minutes'] ? (int) $validated['duration_minutes'] : null)
                : null,
            $validated['ends_at'] ?? $activity->ends_at?->toIso8601String(),
        );
        $assigned = array_key_exists('assigned_to_user_id', $validated)
            ? ($validated['assigned_to_user_id'] ? (int) $validated['assigned_to_user_id'] : null)
            : $activity->assigned_to_user_id;
        $scheduleService->assertNoConflict($activity->applicant_id, $assigned, $window['starts_at'], $window['ends_at'], $activity->id);
        $scheduleService->assertNoDuplicate(
            $activity->applicant_id,
            $validated['title'] ?? $activity->title,
            $window['starts_at'],
            $activity->id,
        );

        $old = $activity->toArray();
        $activity->update([
            ...$validated,
            ...$window,
            'participants' => array_key_exists('participants', $validated)
                ? ActivitySchedule::normalizeParticipants($validated['participants'])
                : $activity->participants,
        ]);
        $activity->loadMissing('applicant');

        if ($activity->applicant?->user_id) {
            $notifications->notifyUser($activity->applicant->user_id, 'schedule_updated', 'Activity schedule updated', "{$activity->title} has been updated.", ['activity_id' => $activity->id]);
        }
        $audit->record('activity.updated', $activity, $old, $activity->fresh()->toArray(), $request);

        return $this->success($activity->fresh(['applicant', 'assignedTo:id,full_name']), 'Activity updated.');
    }

    public function complete(Request $request, ActivitySchedule $activity, NotificationService $notifications, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'result_notes' => ['required', 'string'],
            'status' => ['nullable', Rule::in([ActivityStatus::Completed->value, ActivityStatus::NoShow->value])],
        ]);

        $old = $activity->toArray();
        $activity->update([
            'status' => $validated['status'] ?? ActivityStatus::Completed,
            'result_notes' => $validated['result_notes'],
            'completed_at' => now(),
        ]);
        $activity->loadMissing('applicant');

        $completedStatus = $validated['status'] ?? ActivityStatus::Completed;
        if (
            $activity->applicant
            && $completedStatus === ActivityStatus::Completed
            && ($milestoneKey = $this->milestoneKeyFor($activity->activity_type)) !== null
        ) {
            $this->markApplicantMilestone($activity->applicant, $milestoneKey, $request->user());
        }

        if ($activity->applicant?->user_id) {
            $notifications->notifyUser($activity->applicant->user_id, 'activity_result', 'Activity result recorded', "The result for {$activity->title} has been recorded.", ['activity_id' => $activity->id]);
        }
        $audit->record('activity.completed', $activity, $old, $activity->fresh()->toArray(), $request);

        return $this->success($activity->fresh(), 'Activity result recorded.');
    }

    /**
     * Keep the applicant pipeline in sync with the schedule: completing the
     * matching activity checks its milestone on the applicant's progress
     * tracker immediately (e.g. Orientation complete -> Orientation checked).
     */
    private function milestoneKeyFor(ActivityType $type): ?string
    {
        return match ($type) {
            ActivityType::Orientation => 'orientation_attended',
            ActivityType::ProductTasting => 'product_tasting_attended',
            ActivityType::Training => 'training_completed',
            default => null,
        };
    }

    private function markApplicantMilestone(Applicant $applicant, string $milestoneKey, User $user): void
    {
        $milestones = (array) ($applicant->milestones ?? []);
        if (! empty($milestones[$milestoneKey])) {
            return;
        }

        $milestones[$milestoneKey] = true;
        $details = (array) ($applicant->milestone_details ?? []);
        $details[$milestoneKey] = array_merge($details[$milestoneKey] ?? [], [
            'on' => now()->format('Y-m-d\TH:i'),
            'by' => $this->markerLabel($user),
            'by_user_id' => $user->id,
            'source' => 'activity_schedule',
        ]);

        $applicant->update(['milestones' => $milestones, 'milestone_details' => $details]);
    }

    /** "Marked by" text used when the schedule completes a milestone. */
    private function markerLabel(User $user): string
    {
        $role = str($user->role->name->value)->replace('_', ' ')->title();

        return trim($user->full_name.' ('.$role.')');
    }

    public function destroy(Request $request, ActivitySchedule $activity, AuditService $audit): JsonResponse
    {
        $old = $activity->toArray();
        $activity->update(['status' => ActivityStatus::Cancelled]);
        $audit->record('activity.cancelled', $activity, $old, $activity->fresh()->toArray(), $request);

        return $this->success(message: 'Activity cancelled.');
    }
}
