<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('franchise_locations', function (Blueprint $table): void {
            $table->string('branch_code', 50)->nullable()->unique()->after('name');
        });

        Schema::create('branch_sales', function (Blueprint $table): void {
            $table->id();
            $table->string('sale_number')->unique();
            $table->foreignId('location_id')->constrained('franchise_locations')->restrictOnDelete();
            $table->foreignId('recorded_by_user_id')->constrained('users')->restrictOnDelete();
            $table->string('client_reference', 100);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['location_id', 'client_reference']);
            $table->index(['location_id', 'created_at']);
        });

        Schema::create('branch_sale_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('branch_sale_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inventory_id')->constrained('inventories')->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('inventory_transaction_id')->nullable()->constrained('inventory_transactions')->nullOnDelete();
            $table->decimal('quantity', 14, 2);
            $table->decimal('balance_before', 14, 2);
            $table->decimal('balance_after', 14, 2);
            $table->timestamps();
            $table->unique(['branch_sale_id', 'inventory_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('branch_sale_items');
        Schema::dropIfExists('branch_sales');

        Schema::table('franchise_locations', function (Blueprint $table): void {
            $table->dropUnique(['branch_code']);
            $table->dropColumn('branch_code');
        });
    }
};
