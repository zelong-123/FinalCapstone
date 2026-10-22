<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'last_seen_at')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->timestamp('last_seen_at')->nullable()->after('account_status');
            });
        }

        Schema::create('chat_channels', function (Blueprint $table): void {
            $table->id();
            $table->string('slug', 80)->unique();
            $table->string('name', 120);
            $table->string('type', 30)->default('department'); // department, direct
            $table->string('department', 50)->nullable(); // admin, marketing, sales, logistics, franchisee, or null
            $table->text('description')->nullable();
            $table->timestamps();

            $table->index('type');
            $table->index('department');
        });

        Schema::create('chat_channel_members', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('channel_id')->constrained('chat_channels')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedBigInteger('last_read_message_id')->nullable();
            $table->timestamp('last_read_at')->nullable();
            $table->timestamps();

            $table->unique(['channel_id', 'user_id']);
            $table->index(['user_id', 'channel_id']);
        });

        Schema::create('chat_messages', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('channel_id')->constrained('chat_channels')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->text('message');
            $table->timestamps();

            $table->index(['channel_id', 'id']);
            $table->index(['channel_id', 'created_at']);
        });

        // Seed initial channels and welcome messages
        $now = now();
        $initialChannels = [
            [
                'slug' => 'general',
                'name' => 'General / All Departments',
                'type' => 'department',
                'department' => null,
                'description' => 'Company-wide updates, announcements, and inter-department coordination.',
                'welcome' => '👋 Welcome to Franchise Titan Live Messenger! This is the company-wide live room for all staff and franchise operators.',
            ],
            [
                'slug' => 'admin',
                'name' => 'Administration & Executive',
                'type' => 'department',
                'department' => 'admin',
                'description' => 'Executive decisions, policy administration, and system governance.',
                'welcome' => '👑 Administration team channel active. Real-time coordination for executive and managerial tasks.',
            ],
            [
                'slug' => 'marketing',
                'name' => 'Marketing Department',
                'type' => 'department',
                'department' => 'marketing',
                'description' => 'Campaigns, lead acquisition, branding, and promotional strategy.',
                'welcome' => '📈 Marketing team live room ready. Discuss campaigns, prospective franchisee inquiries, and outreach.',
            ],
            [
                'slug' => 'sales',
                'name' => 'Sales & Franchise Pipeline',
                'type' => 'department',
                'department' => 'sales',
                'description' => 'Franchise applicant pipeline, discovery calls, contracts, and conversions.',
                'welcome' => '💼 Sales & Development team channel active. Real-time updates on franchisee applicants and conversions.',
            ],
            [
                'slug' => 'logistics',
                'name' => 'Logistics & Warehouse',
                'type' => 'department',
                'department' => 'logistics',
                'description' => 'Warehouse stock, inventory replenishment, and supply fulfillment.',
                'welcome' => '📦 Logistics & Supply operations channel active. Coordinate dispatch, stock deductions, and restocks.',
            ],
            [
                'slug' => 'franchisee',
                'name' => 'Franchisee & Branch Operations',
                'type' => 'department',
                'department' => 'franchisee',
                'description' => 'Branch operations, store management, and franchisee support.',
                'welcome' => '🏪 Franchisee and branch support channel active. Submit questions and coordinate directly with HQ.',
            ],
        ];

        $adminUserId = DB::table('users')->where('email', 'admin@franchisetitan.local')->value('id')
            ?: DB::table('users')->orderBy('id')->value('id');

        foreach ($initialChannels as $channelData) {
            $welcome = $channelData['welcome'];
            unset($channelData['welcome']);
            $channelData['created_at'] = $now;
            $channelData['updated_at'] = $now;

            $channelId = DB::table('chat_channels')->insertGetId($channelData);

            if ($adminUserId) {
                DB::table('chat_messages')->insert([
                    'channel_id' => $channelId,
                    'user_id' => $adminUserId,
                    'message' => $welcome,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_messages');
        Schema::dropIfExists('chat_channel_members');
        Schema::dropIfExists('chat_channels');

        if (Schema::hasColumn('users', 'last_seen_at')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->dropColumn('last_seen_at');
            });
        }
    }
};
