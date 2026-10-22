<?php

namespace Tests\Feature;

use App\Enums\ActivityStatus;
use App\Enums\ActivityType;
use App\Enums\ApplicantStatus;
use App\Enums\RoleName;
use App\Models\ActivitySchedule;
use App\Models\Applicant;
use App\Services\ScheduleService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\AuthenticatesApiUsers;
use Tests\TestCase;

class ScheduleConflictTest extends TestCase
{
    use AuthenticatesApiUsers, RefreshDatabase;

    public function test_overlapping_applicant_or_staff_schedule_is_rejected(): void
    {
        $sales = $this->createUser(RoleName::Sales);
        $applicant = Applicant::create([
            'full_name' => 'Schedule Applicant',
            'email' => 'schedule@example.test',
            'status' => ApplicantStatus::Inquiry,
            'application_date' => now()->toDateString(),
        ]);

        $start = CarbonImmutable::parse('2030-01-15 10:00:00');
        $end = $start->addHour();
        ActivitySchedule::create([
            'applicant_id' => $applicant->id,
            'activity_type' => ActivityType::Orientation,
            'title' => 'Orientation',
            'starts_at' => $start,
            'ends_at' => $end,
            'status' => ActivityStatus::Confirmed,
            'assigned_to_user_id' => $sales->id,
            'scheduled_by_user_id' => $sales->id,
        ]);

        $this->expectException(ValidationException::class);
        app(ScheduleService::class)->assertNoConflict(
            $applicant->id,
            $sales->id,
            $start->addMinutes(30),
            $end->addMinutes(30),
        );
    }
}
