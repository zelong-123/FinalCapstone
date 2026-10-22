<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('brand_id')->nullable()->constrained('brands')->nullOnDelete();
            $table->string('sku')->unique();
            $table->string('name');
            $table->string('category')->nullable()->index();
            $table->string('unit', 30)->default('piece');
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::create('inventories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('location_id')->constrained('franchise_locations')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->decimal('current_stock', 14, 2)->default(0);
            $table->decimal('reorder_level', 14, 2)->default(0);
            $table->decimal('critical_level', 14, 2)->default(0);
            $table->timestamp('last_counted_at')->nullable();
            $table->foreignId('updated_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['location_id', 'product_id']);
        });

        Schema::create('inventory_transactions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('inventory_id')->constrained()->cascadeOnDelete();
            $table->string('type', 40)->index();
            $table->decimal('quantity', 14, 2);
            $table->decimal('balance_before', 14, 2);
            $table->decimal('balance_after', 14, 2);
            $table->string('reference_type')->nullable();
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->text('remarks')->nullable();
            $table->foreignId('recorded_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('transaction_date')->index();
            $table->timestamps();
            $table->index(['reference_type', 'reference_id']);
        });

        Schema::create('supply_requests', function (Blueprint $table): void {
            $table->id();
            $table->string('request_number')->unique();
            $table->foreignId('location_id')->constrained('franchise_locations')->restrictOnDelete();
            $table->foreignId('requested_by_user_id')->constrained('users')->restrictOnDelete();
            $table->string('status', 40)->default('draft')->index();
            $table->date('target_delivery_date')->nullable()->index();
            $table->text('delivery_address');
            $table->text('remarks')->nullable();
            $table->foreignId('reviewed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('endorsed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('endorsed_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->index(['location_id', 'status']);
        });

        Schema::create('supply_request_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('supply_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity_requested', 14, 2);
            $table->decimal('quantity_fulfilled', 14, 2)->default(0);
            $table->timestamps();
            $table->unique(['supply_request_id', 'product_id']);
        });

        Schema::create('supply_request_status_histories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('supply_request_id')->constrained()->cascadeOnDelete();
            $table->string('from_status', 40)->nullable();
            $table->string('to_status', 40)->index();
            $table->text('remarks')->nullable();
            $table->foreignId('changed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('deliveries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('supply_request_id')->unique()->constrained()->cascadeOnDelete();
            $table->date('delivery_date')->nullable();
            $table->timestamp('dispatched_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->foreignId('delivered_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('recipient_name')->nullable();
            $table->timestamp('acknowledged_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deliveries');
        Schema::dropIfExists('supply_request_status_histories');
        Schema::dropIfExists('supply_request_items');
        Schema::dropIfExists('supply_requests');
        Schema::dropIfExists('inventory_transactions');
        Schema::dropIfExists('inventories');
        Schema::dropIfExists('products');
    }
};
