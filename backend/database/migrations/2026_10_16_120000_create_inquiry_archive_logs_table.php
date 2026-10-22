<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Safety net: the new inquiry-form columns are added only if they are still missing.
        $formColumns = [
            'first_name' => 100,
            'last_name' => 100,
            'viber_number' => 30,
            'current_city' => 255,
            'preferred_franchise_location' => 255,
        ];
        foreach ($formColumns as $name => $length) {
            if (! Schema::hasColumn('franchise_inquiries', $name)) {
                Schema::table('franchise_inquiries', function (Blueprint $table) use ($name, $length) {
                    $table->string($name, $length)->nullable();
                });
            }
        }

        // One row per archive event. Plain columns (no foreign keys) so the history
        // survives even if a user or an inquiry is deleted later.
        Schema::create('inquiry_archive_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('archive_id')->nullable()->unique(); // 10000 + id
            $table->unsignedBigInteger('franchise_inquiry_id')->index();
            $table->string('lead_name');
            $table->unsignedInteger('original_display_no')->nullable();
            $table->unsignedBigInteger('archived_by_user_id')->nullable();
            $table->timestamp('archived_at')->nullable();
            $table->timestamp('restored_at')->nullable();
            $table->unsignedBigInteger('restored_by_user_id')->nullable();
            $table->timestamps();
        });

        // Give inquiries that were archived before this feature an Archive ID.
        // Their old display number cannot be recovered, so it stays empty.
        $archived = DB::table('franchise_inquiries')
            ->whereNotNull('archived_at')
            ->get(['id', 'lead_name', 'archived_by_user_id', 'archived_at']);

        foreach ($archived as $row) {
            $logId = DB::table('inquiry_archive_logs')->insertGetId([
                'franchise_inquiry_id' => $row->id,
                'lead_name' => $row->lead_name,
                'original_display_no' => null,
                'archived_by_user_id' => $row->archived_by_user_id,
                'archived_at' => $row->archived_at,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('inquiry_archive_logs')->where('id', $logId)->update(['archive_id' => 10000 + $logId]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('inquiry_archive_logs');
    }
};
