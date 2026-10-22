<?php

namespace Tests\Feature;

use App\Enums\ActivityStatus;
use App\Enums\ActivityType;
use App\Enums\ApplicantStatus;
use App\Enums\InquiryStatus;
use App\Enums\RoleName;
use App\Models\ActivitySchedule;
use App\Models\Applicant;
use App\Models\FranchiseInquiry;
use App\Models\Franchisee;
use App\Models\FranchiseLocation;
use App\Services\ScheduleService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\AuthenticatesApiUsers;
use Tests\TestCase;

class FranchiseOperationsTest extends TestCase
{
    use AuthenticatesApiUsers, RefreshDatabase;

    private function applicant(array $attributes = []): Applicant
    {
        return Applicant::create([
            'full_name' => 'Ana Reyes',
            'email' => 'ana@example.test',
            'status' => ApplicantStatus::Inquiry,
            'application_date' => now()->toDateString(),
            ...$attributes,
        ]);
    }

    // ---------- Applicants ----------

    public function test_applicant_list_hides_archived_records_and_archived_filter_returns_them(): void
    {
        $admin = $this->createUser(RoleName::Admin);
        $this->applicant(['full_name' => 'Visible Applicant']);
        $this->applicant(['full_name' => 'Archived Applicant', 'archived_at' => now()]);

        $active = $this->getJson('/api/v1/applicants', $this->tokenHeaders($admin));
        $active->assertOk();
        $this->assertSame(['Visible Applicant'], collect($active->json('data'))->pluck('full_name')->all());

        $archived = $this->getJson('/api/v1/applicants?archived=1', $this->tokenHeaders($admin));
        $archived->assertOk();
        $this->assertSame(['Archived Applicant'], collect($archived->json('data'))->pluck('full_name')->all());
    }

    public function test_applicant_progress_indicator_reflects_milestones_and_stage(): void
    {
        $admin = $this->createUser(RoleName::Admin);
        $applicant = $this->applicant([
            'status' => ApplicantStatus::Scheduled,
            'milestones' => ['account_record_set_up' => true, 'documents_completed' => true],
        ]);

        $response = $this->getJson("/api/v1/applicants/{$applicant->id}", $this->tokenHeaders($admin));
        $response->assertOk();

        $progress = $response->json('data.progress');
        $this->assertSame(2, $progress['milestones_completed']);
        $this->assertSame(count(config('franchise.milestones')), $progress['milestones_total']);
        $this->assertSame('in_progress', $progress['state']);
        $this->assertGreaterThan(0, $progress['percent']);
    }

    public function test_applicant_milestones_can_be_ticked_and_rejected_for_unknown_keys(): void
    {
        $sales = $this->createUser(RoleName::Sales);
        $applicant = $this->applicant();

        $ok = $this->patchJson(
            "/api/v1/applicants/{$applicant->id}/milestones",
            ['milestones' => ['account_record_set_up' => true, 'documents_completed' => true]],
            $this->tokenHeaders($sales),
        );
        $ok->assertOk();
        $this->assertTrue($ok->json('data.milestones.account_record_set_up'));
        $this->assertFalse($ok->json('data.milestones.orientation_attended'));
        $this->assertSame(2, $ok->json('data.progress.milestones_completed'));

        $this->patchJson(
            "/api/v1/applicants/{$applicant->id}/milestones",
            ['milestones' => ['not_a_real_milestone' => true]],
            $this->tokenHeaders($sales),
        )->assertStatus(422);
    }

    public function test_applicant_can_be_archived_and_restored(): void
    {
        $admin = $this->createUser(RoleName::Admin);
        $applicant = $this->applicant();

        $this->postJson("/api/v1/applicants/{$applicant->id}/archive", [], $this->tokenHeaders($admin))->assertOk();
        $this->assertNotNull($applicant->fresh()->archived_at);

        $this->postJson("/api/v1/applicants/{$applicant->id}/restore", [], $this->tokenHeaders($admin))->assertOk();
        $this->assertNull($applicant->fresh()->archived_at);
    }

    public function test_admin_can_remove_an_applicant_but_not_an_active_franchisee(): void
    {
        $admin = $this->createUser(RoleName::Admin);
        $applicant = $this->applicant();

        $this->deleteJson("/api/v1/applicants/{$applicant->id}", [], $this->tokenHeaders($admin))->assertOk();
        $this->assertNull(Applicant::query()->find($applicant->id));

        $franchisee = $this->applicant(['status' => ApplicantStatus::ActiveFranchisee]);
        $this->deleteJson("/api/v1/applicants/{$franchisee->id}", [], $this->tokenHeaders($admin))
            ->assertStatus(422);
    }

    public function test_active_franchisees_are_listed_on_their_own_endpoint(): void
    {
        $admin = $this->createUser(RoleName::Admin);
        $applicant = $this->applicant(['status' => ApplicantStatus::ActiveFranchisee]);
        Franchisee::create([
            'applicant_id' => $applicant->id,
            'business_name' => 'Reyes Coffee Stall',
            'franchise_status' => 'active',
            'approval_date' => now()->toDateString(),
        ]);
        FranchiseLocation::create([
            'franchisee_id' => null,
            'name' => 'Reyes Stall',
            'type' => 'franchise',
            'address' => '1 Main St',
            'is_active' => true,
        ]);

        $response = $this->getJson('/api/v1/applicants/active-franchisees', $this->tokenHeaders($admin));
        $response->assertOk();
        $this->assertSame('Reyes Coffee Stall', $response->json('data.0.business_name'));
    }

    // ---------- Inquiries ----------

    private function inquiry(array $attributes = []): FranchiseInquiry
    {
        return FranchiseInquiry::create([
            'lead_name' => 'Lead One',
            'email' => 'lead@example.test',
            'source' => 'facebook',
            'status' => InquiryStatus::Endorsed,
            'inquiry_date' => now()->toDateString(),
            'encoded_by_user_id' => $this->createUser(RoleName::Marketing)->id,
            ...$attributes,
        ]);
    }

    public function test_inquiry_conversion_can_be_undone_while_still_at_the_first_stage(): void
    {
        $sales = $this->createUser(RoleName::Sales);
        // Visibility rule: Sales only sees inquiries they encoded or that were endorsed to them.
        $inquiry = $this->inquiry(['endorsed_to_user_id' => $sales->id]);

        $this->postJson("/api/v1/inquiries/{$inquiry->id}/convert", [], $this->tokenHeaders($sales))->assertCreated();
        $this->assertSame(InquiryStatus::Converted, $inquiry->fresh()->status);
        $this->assertSame(1, Applicant::query()->count());

        $this->postJson("/api/v1/inquiries/{$inquiry->id}/unconvert", [], $this->tokenHeaders($sales))->assertOk();
        $this->assertSame(InquiryStatus::Endorsed, $inquiry->fresh()->status);
        $this->assertSame(0, Applicant::query()->count());
    }

    public function test_conversion_cannot_be_undone_after_the_applicant_progressed(): void
    {
        $sales = $this->createUser(RoleName::Sales);
        $inquiry = $this->inquiry(['endorsed_to_user_id' => $sales->id]);

        $this->postJson("/api/v1/inquiries/{$inquiry->id}/convert", [], $this->tokenHeaders($sales))->assertCreated();
        Applicant::query()->first()->update(['status' => ApplicantStatus::Scheduled]);

        $this->postJson("/api/v1/inquiries/{$inquiry->id}/unconvert", [], $this->tokenHeaders($sales))
            ->assertStatus(422);
        $this->assertSame(1, Applicant::query()->count());
    }

    public function test_inquiry_can_be_archived_and_restored(): void
    {
        $admin = $this->createUser(RoleName::Admin);
        // Admin sees inquiries endorsed to them (see FranchiseInquiry::scopeVisibleTo).
        $inquiry = $this->inquiry(['endorsed_to_user_id' => $admin->id]);

        $this->postJson("/api/v1/inquiries/{$inquiry->id}/archive", [], $this->tokenHeaders($admin))->assertOk();
        $this->assertNotNull($inquiry->fresh()->archived_at);

        $this->getJson('/api/v1/inquiries', $this->tokenHeaders($admin))->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/inquiries?archived=1', $this->tokenHeaders($admin))->assertOk()->assertJsonCount(1, 'data');

        $this->postJson("/api/v1/inquiries/{$inquiry->id}/restore", [], $this->tokenHeaders($admin))->assertOk();
        $this->assertNull($inquiry->fresh()->archived_at);
    }

    public function test_converted_inquiry_must_be_unconverted_before_deletion(): void
    {
        $admin = $this->createUser(RoleName::Admin);
        $inquiry = $this->inquiry(['endorsed_to_user_id' => $admin->id]);

        $this->postJson("/api/v1/inquiries/{$inquiry->id}/convert", [], $this->tokenHeaders($admin))->assertCreated();
        $this->deleteJson("/api/v1/inquiries/{$inquiry->id}", [], $this->tokenHeaders($admin))->assertStatus(422);

        $this->postJson("/api/v1/inquiries/{$inquiry->id}/unconvert", [], $this->tokenHeaders($admin))->assertOk();
        $this->deleteJson("/api/v1/inquiries/{$inquiry->id}", [], $this->tokenHeaders($admin))->assertOk();
        $this->assertNull(FranchiseInquiry::query()->find($inquiry->id));
    }

    // ---------- Activities ----------

    public function test_activity_window_is_derived_from_duration(): void
    {
        $sales = $this->createUser(RoleName::Sales);
        $applicant = $this->applicant();
        $startsAt = now()->addDay()->startOfHour();

        $window = app(ScheduleService::class)->resolveWindow($startsAt, 90, null);

        $this->assertSame(90, $window['duration_minutes']);
        $this->assertTrue($startsAt->copy()->addMinutes(90)->eq($window['ends_at']));

        $response = $this->postJson('/api/v1/activities', [
            'applicant_id' => $applicant->id,
            'activity_type' => ActivityType::Orientation->value,
            'title' => 'Duration Orientation',
            'starts_at' => $startsAt->toIso8601String(),
            'duration_minutes' => 90,
        ], $this->tokenHeaders($sales));

        $response->assertCreated();
        $this->assertSame(90, $response->json('data.duration_minutes'));
    }

    public function test_duplicate_activity_for_the_same_person_is_rejected(): void
    {
        $sales = $this->createUser(RoleName::Sales);
        $applicant = $this->applicant();
        $startsAt = now()->addDays(2)->startOfHour();

        $payload = [
            'applicant_id' => $applicant->id,
            'activity_type' => ActivityType::Training->value,
            'title' => 'Duplicate Training',
            'starts_at' => $startsAt->toIso8601String(),
            'duration_minutes' => 60,
        ];

        $this->postJson('/api/v1/activities', $payload, $this->tokenHeaders($sales))->assertCreated();
        // Same person, same title, same start: must be refused as a duplicate.
        $this->postJson('/api/v1/activities', $payload, $this->tokenHeaders($sales))->assertStatus(422);

        $this->assertSame(1, ActivitySchedule::query()->count());
    }

    public function test_participant_list_drops_blanks_and_repeated_names(): void
    {
        $clean = ActivitySchedule::normalizeParticipants([
            'Ana Reyes', '  ', 'ana reyes', 'Mark Dela Cruz', 'ANA REYES', null,
        ]);

        $this->assertSame(['Ana Reyes', 'Mark Dela Cruz'], $clean);
    }

    public function test_blank_participant_entries_are_accepted_and_discarded(): void
    {
        $sales = $this->createUser(RoleName::Sales);
        $applicant = $this->applicant();

        // Whitespace-only and null entries arrive as null once empty strings are
        // trimmed, so validation must tolerate them instead of rejecting the request.
        $response = $this->postJson('/api/v1/activities', [
            'applicant_id' => $applicant->id,
            'activity_type' => ActivityType::Other->value,
            'title' => 'Blank Participant Handling',
            'starts_at' => now()->addDays(9)->startOfHour()->toIso8601String(),
            'duration_minutes' => 60,
            'participants' => ['Ana Reyes', 'ana reyes', '  ', null, 'Mark Dela Cruz'],
        ], $this->tokenHeaders($sales));

        $response->assertCreated();
        $this->assertSame(['Ana Reyes', 'Mark Dela Cruz'], $response->json('data.participants'));
    }

    public function test_grouped_activities_list_each_person_once(): void
    {
        $sales = $this->createUser(RoleName::Sales);
        $applicant = $this->applicant(['status' => ApplicantStatus::Scheduled]);
        $other = $this->applicant(['full_name' => 'Other Applicant', 'status' => ApplicantStatus::Scheduled]);

        ActivitySchedule::create([
            'applicant_id' => $applicant->id,
            'activity_type' => ActivityType::Orientation,
            'title' => 'Orientation A',
            'starts_at' => now()->addDay(),
            'ends_at' => now()->addDay()->addHour(),
            'status' => ActivityStatus::Completed,
            'assigned_to_user_id' => $sales->id,
            'scheduled_by_user_id' => $sales->id,
        ]);
        ActivitySchedule::create([
            'applicant_id' => $other->id,
            'activity_type' => ActivityType::Training,
            'title' => 'Training B',
            'starts_at' => now()->addDays(3),
            'ends_at' => now()->addDays(3)->addHours(2),
            'status' => ActivityStatus::Confirmed,
            'assigned_to_user_id' => $sales->id,
            'scheduled_by_user_id' => $sales->id,
        ]);

        $response = $this->getJson('/api/v1/activities/grouped', $this->tokenHeaders($sales));
        $response->assertOk();

        $people = collect($response->json('data'))->pluck('person')->all();
        // The same person holds two activities but is listed only once.
        $this->assertSame([$sales->full_name], $people);
        $this->assertSame(2, $response->json('data.0.total'));
        $this->assertSame(1, $response->json('data.0.completed'));
    }

    public function test_activity_information_is_editable(): void
    {
        $sales = $this->createUser(RoleName::Sales);
        $applicant = $this->applicant();
        $startsAt = now()->addDays(4)->startOfHour();

        $created = $this->postJson('/api/v1/activities', [
            'applicant_id' => $applicant->id,
            'activity_type' => ActivityType::Other,
            'title' => 'Original Title',
            'starts_at' => $startsAt->toIso8601String(),
            'duration_minutes' => 60,
        ], $this->tokenHeaders($sales))->assertCreated();

        $id = $created->json('data.id');

        $this->putJson("/api/v1/activities/{$id}", [
            'title' => 'Edited Title',
            'duration_minutes' => 180,
            'venue' => 'Main Office',
        ], $this->tokenHeaders($sales))->assertOk();

        $activity = ActivitySchedule::query()->findOrFail($id);
        $this->assertSame('Edited Title', $activity->title);
        $this->assertSame('Main Office', $activity->venue);
        $this->assertSame(180, $activity->duration_minutes);
    }

    public function test_database_rejects_a_second_activity_in_the_same_slot(): void
    {
        $sales = $this->createUser(RoleName::Sales);
        $applicant = $this->applicant();
        $startsAt = now()->addDays(6)->startOfHour();

        $base = [
            'applicant_id' => $applicant->id,
            'activity_type' => ActivityType::Orientation,
            'title' => 'Same Slot',
            'starts_at' => $startsAt,
            'ends_at' => $startsAt->copy()->addHour(),
            'status' => ActivityStatus::Confirmed,
            'assigned_to_user_id' => $sales->id,
            'scheduled_by_user_id' => $sales->id,
        ];

        ActivitySchedule::create($base);

        // The unique slot is the last line of defence against spam entries.
        $this->expectException(QueryException::class);
        ActivitySchedule::create($base);
    }

    public function test_duplicate_assertion_rejects_a_second_identical_slot(): void
    {
        $sales = $this->createUser(RoleName::Sales);
        $applicant = $this->applicant();
        $startsAt = now()->addDays(7)->startOfHour();

        ActivitySchedule::create([
            'applicant_id' => $applicant->id,
            'activity_type' => ActivityType::Orientation,
            'title' => 'Same Title',
            'starts_at' => $startsAt,
            'ends_at' => $startsAt->copy()->addHour(),
            'status' => ActivityStatus::Confirmed,
            'assigned_to_user_id' => $sales->id,
            'scheduled_by_user_id' => $sales->id,
        ]);

        $this->expectException(ValidationException::class);
        app(ScheduleService::class)->assertNoDuplicate($applicant->id, 'Same Title', $startsAt);
    }

    public function test_a_different_title_in_the_same_slot_is_still_allowed(): void
    {
        $sales = $this->createUser(RoleName::Sales);
        $applicant = $this->applicant();
        $startsAt = now()->addDays(8)->startOfHour();

        // Multiple activities for the same person are expected, just not exact duplicates.
        foreach (['Orientation', 'Product Tasting', 'Training'] as $title) {
            ActivitySchedule::create([
                'applicant_id' => $applicant->id,
                'activity_type' => ActivityType::Other,
                'title' => $title,
                'starts_at' => $startsAt,
                'ends_at' => $startsAt->copy()->addHour(),
                'status' => ActivityStatus::Confirmed,
                'assigned_to_user_id' => $sales->id,
                'scheduled_by_user_id' => $sales->id,
            ]);
        }

        $this->assertSame(3, ActivitySchedule::query()->count());
    }

    // ---------- Archive ----------

    public function test_archive_endpoint_lists_archived_records_across_all_three_types(): void
    {
        $admin = $this->createUser(RoleName::Admin);
        $applicant = $this->applicant(['archived_at' => now()]);
        $inquiry = $this->inquiry(['archived_at' => now()]);

        $response = $this->getJson('/api/v1/archive', $this->tokenHeaders($admin));
        $response->assertOk();

        $this->assertSame(1, $response->json('data.applicants.count'));
        $this->assertSame(1, $response->json('data.inquiries.count'));
        $this->assertSame($applicant->full_name, $response->json('data.applicants.items.0.label'));
        $this->assertSame($inquiry->lead_name, $response->json('data.inquiries.items.0.label'));

        $this->postJson("/api/v1/archive/applicants/{$applicant->id}/restore", [], $this->tokenHeaders($admin))
            ->assertOk();
        $this->assertNull($applicant->fresh()->archived_at);
    }

    public function test_archive_endpoint_is_admin_only(): void
    {
        $sales = $this->createUser(RoleName::Sales);
        $this->getJson('/api/v1/archive', $this->tokenHeaders($sales))->assertForbidden();
    }

    // ---------- Franchising dashboard ----------

    public function test_franchising_dashboard_returns_trend_branches_insights_alerts_and_applications(): void
    {
        $admin = $this->createUser(RoleName::Admin);
        $this->applicant(['full_name' => 'Dashboard Applicant']);

        $response = $this->getJson('/api/v1/analytics/franchising-dashboard?period=month', $this->tokenHeaders($admin));
        $response->assertOk();

        $this->assertCount(12, $response->json('data.sales_trend'));
        $this->assertNotEmpty($response->json('data.insights'));
        $this->assertIsArray($response->json('data.alerts'));
        $this->assertSame('Dashboard Applicant', $response->json('data.recent_applications.0.full_name'));
        // No sales recorded yet, so every bucket reads zero.
        $this->assertSame(0, $response->json('data.sales_trend.11.sales'));
        $this->assertSame(now()->format('M Y'), $response->json('data.sales_trend.11.label'));
        $this->assertSame(1, $response->json('data.summary.active_applicants'));
    }

    public function test_franchising_dashboard_uses_six_buckets_for_year_period(): void
    {
        $admin = $this->createUser(RoleName::Admin);

        $response = $this->getJson('/api/v1/analytics/franchising-dashboard?period=year', $this->tokenHeaders($admin));
        $response->assertOk();

        $this->assertCount(6, $response->json('data.sales_trend'));
    }

    public function test_franchising_dashboard_is_restricted_to_admin_and_sales(): void
    {
        $marketing = $this->createUser(RoleName::Marketing);
        $this->getJson('/api/v1/analytics/franchising-dashboard', $this->tokenHeaders($marketing))
            ->assertForbidden();
    }
}