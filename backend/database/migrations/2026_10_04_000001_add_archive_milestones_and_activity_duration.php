<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['users', 'franchise_inquiries', 'applicants'] as $table) {
            Schema::table($table, function (Blueprint $blueprint): void {
                $blueprint->timestamp('archived_at')->nullable()->after('updated_at');
                $blueprint->foreignId('archived_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            });
        }

        Schema::table('franchise_inquiries', function (Blueprint $blueprint): void {
            // Remembers the stage an inquiry sat at before conversion so the
            // conversion can be undone back to exactly the right status.
            $blueprint->string('converted_from_status', 30)->nullable()->after('status');
        });

        Schema::table('applicants', function (Blueprint $blueprint): void {
            $blueprint->json('milestones')->nullable();
            $blueprint->index(['archived_at', 'status'], 'applicants_archived_status_idx');
        });

        Schema::table('activity_schedules', function (Blueprint $blueprint): void {
            $blueprint->unsignedSmallInteger('duration_minutes')->nullable()->after('ends_at');
        });

        // Collapse pre-existing duplicate/spam rows before enforcing uniqueness, so the
        // index can be created even on databases that already contain duplicates.
        $duplicateSlots = DB::table('activity_schedules')
            ->select('applicant_id', 'title', 'starts_at', DB::raw('MIN(id) as keep_id'))
            ->groupBy('applicant_id', 'title', 'starts_at')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($duplicateSlots as $slot) {
            DB::table('activity_schedules')
                ->where('applicant_id', $slot->applicant_id)
                ->where('title', $slot->title)
                ->where('starts_at', $slot->starts_at)
                ->where('id', '>', $slot->keep_id)
                ->delete();
        }

        // One activity row per applicant/title/start time: blocks the duplicate or spam
        // entries that could previously be created for the same person.
        Schema::table('activity_schedules', function (Blueprint $blueprint): void {
            $blueprint->unique(['applicant_id', 'title', 'starts_at'], 'activity_schedules_unique_slot');
        });
    }

    public function down(): void
    {
        Schema::table('activity_schedules', function (Blueprint $blueprint): void {
            $blueprint->dropUnique('activity_schedules_unique_slot');
            $blueprint->dropColumn('duration_minutes');
        });

        Schema::table('franchise_inquiries', function (Blueprint $blueprint): void {
            $blueprint->dropColumn('converted_from_status');
        });

        Schema::table('applicants', function (Blueprint $blueprint): void {
            $blueprint->dropIndex('applicants_archived_status_idx');
            $blueprint->dropColumn('milestones');
        });

        foreach (['users', 'franchise_inquiries', 'applicants'] as $table) {
            Schema::table($table, function (Blueprint $blueprint): void {
                $blueprint->dropForeign(['archived_by_user_id']);
                $blueprint->dropColumn(['archived_at', 'archived_by_user_id']);
            });
        }
    }
};