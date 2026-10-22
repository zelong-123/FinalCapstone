<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Stores "Date marked" / "Marked by" for each completed accomplishment, keyed by
     * milestone key, e.g. {"account_record": {"on": "2026-10-17T09:30", "by": "John (Admin)", "by_user_id": 1}}.
     * The existing `milestones` column (key => true/false) is left exactly as it is.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('applicants', 'milestone_details')) {
            Schema::table('applicants', function (Blueprint $table) {
                $table->json('milestone_details')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('applicants', 'milestone_details')) {
            Schema::table('applicants', function (Blueprint $table) {
                $table->dropColumn('milestone_details');
            });
        }
    }
};
