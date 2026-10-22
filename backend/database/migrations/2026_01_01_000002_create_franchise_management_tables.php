<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('brands', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->unique();
            $table->string('code', 30)->unique();
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::create('franchise_inquiries', function (Blueprint $table): void {
            $table->id();
            $table->string('lead_name');
            $table->string('email')->nullable()->index();
            $table->string('phone', 50)->nullable()->index();
            $table->text('address')->nullable();
            $table->string('source', 50)->index();
            $table->foreignId('preferred_brand_id')->nullable()->constrained('brands')->nullOnDelete();
            $table->string('status', 30)->default('new')->index();
            $table->text('remarks')->nullable();
            $table->foreignId('encoded_by_user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('endorsed_to_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->date('inquiry_date')->index();
            $table->timestamps();
            $table->index(['status', 'inquiry_date']);
        });

        Schema::create('applicants', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('inquiry_id')->nullable()->unique()->constrained('franchise_inquiries')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->unique()->constrained('users')->nullOnDelete();
            $table->foreignId('preferred_brand_id')->nullable()->constrained('brands')->nullOnDelete();
            $table->string('full_name');
            $table->string('email')->nullable()->index();
            $table->string('phone', 50)->nullable()->index();
            $table->text('address')->nullable();
            $table->string('status', 40)->default('inquiry')->index();
            $table->date('application_date')->index();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('rejected_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('applicant_status_histories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('applicant_id')->constrained()->cascadeOnDelete();
            $table->string('from_status', 40)->nullable();
            $table->string('to_status', 40)->index();
            $table->text('remarks')->nullable();
            $table->foreignId('changed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('activity_schedules', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('applicant_id')->constrained()->cascadeOnDelete();
            $table->string('activity_type', 40)->index();
            $table->string('title');
            $table->dateTime('starts_at')->index();
            $table->dateTime('ends_at')->index();
            $table->string('venue')->nullable();
            $table->string('status', 30)->default('pending')->index();
            $table->foreignId('assigned_to_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('scheduled_by_user_id')->constrained('users')->restrictOnDelete();
            $table->json('participants')->nullable();
            $table->text('result_notes')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->index(['assigned_to_user_id', 'starts_at', 'ends_at'], 'activity_assignee_window_idx');
        });

        Schema::create('payments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('applicant_id')->constrained()->cascadeOnDelete();
            $table->string('payment_type', 50);
            $table->decimal('amount', 14, 2);
            $table->date('payment_date')->index();
            $table->string('reference_number')->nullable()->index();
            $table->string('status', 30)->default('pending')->index();
            $table->foreignId('recorded_by_user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('verified_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('verified_at')->nullable();
            $table->text('remarks')->nullable();
            $table->timestamps();
        });

        Schema::create('franchisees', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('applicant_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->unique()->constrained('users')->nullOnDelete();
            $table->string('business_name');
            $table->string('franchise_status', 30)->default('active')->index();
            $table->date('approval_date');
            $table->timestamps();
        });

        Schema::create('franchise_locations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('franchisee_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('brand_id')->nullable()->constrained('brands')->nullOnDelete();
            $table->string('name');
            $table->string('type', 30)->default('franchise')->index();
            $table->text('address');
            $table->string('city')->nullable()->index();
            $table->string('province')->nullable()->index();
            $table->string('region')->nullable()->index();
            $table->string('contact_number', 50)->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::create('documents', function (Blueprint $table): void {
            $table->id();
            $table->morphs('documentable');
            $table->string('type', 50)->index();
            $table->string('original_name');
            $table->string('stored_name');
            $table->string('disk', 50)->default('private');
            $table->string('path');
            $table->string('mime_type', 150)->nullable();
            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->foreignId('uploaded_by_user_id')->constrained('users')->restrictOnDelete();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('documents');
        Schema::dropIfExists('franchise_locations');
        Schema::dropIfExists('franchisees');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('activity_schedules');
        Schema::dropIfExists('applicant_status_histories');
        Schema::dropIfExists('applicants');
        Schema::dropIfExists('franchise_inquiries');
        Schema::dropIfExists('brands');
    }
};
