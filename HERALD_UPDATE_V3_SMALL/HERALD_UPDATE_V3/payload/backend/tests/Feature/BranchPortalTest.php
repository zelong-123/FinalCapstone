<?php

namespace Tests\Feature;

use App\Enums\ApplicantStatus;
use App\Enums\LocationType;
use App\Enums\RoleName;
use App\Models\Applicant;
use App\Models\Brand;
use App\Models\Franchisee;
use App\Models\FranchiseLocation;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesApiUsers;
use Tests\TestCase;

class BranchPortalTest extends TestCase
{
    use AuthenticatesApiUsers, RefreshDatabase;

    public function test_branch_sale_deducts_shared_inventory_once_and_rejects_wrong_branch(): void
    {
        $branchUser = $this->createUser(RoleName::Franchisee);
        $otherBranchUser = $this->createUser(RoleName::Franchisee);
        $brand = Brand::create(['name' => 'Branch Brand', 'code' => 'BRANCH', 'is_active' => true]);
        $product = Product::create([
            'brand_id' => $brand->id,
            'sku' => 'BRANCH-001',
            'name' => 'Branch Product',
            'unit' => 'piece',
            'is_active' => true,
        ]);
        $location = $this->makeBranch($branchUser, $brand, 'branch-1', 'Owned Branch');
        $this->makeBranch($otherBranchUser, $brand, 'branch-2', 'Other Branch');
        $inventory = Inventory::create([
            'location_id' => $location->id,
            'product_id' => $product->id,
            'current_stock' => 10,
            'reorder_level' => 4,
            'critical_level' => 2,
        ]);

        $payload = [
            'branch_code' => 'branch-1',
            'client_reference' => 'device-transaction-001',
            'notes' => 'Receipt 1001',
            'items' => [[
                'inventory_id' => $inventory->id,
                'quantity' => 3,
            ]],
        ];

        $this->withHeaders($this->tokenHeaders($branchUser))
            ->postJson('/api/v1/branch/sales?branch_code=branch-1', $payload)
            ->assertCreated()
            ->assertJsonPath('data.duplicate', false)
            ->assertJsonPath('data.sale.items.0.balance_after', '7.00');

        $this->assertEquals(7.0, (float) $inventory->fresh()->current_stock);
        $this->assertDatabaseHas('inventory_transactions', [
            'inventory_id' => $inventory->id,
            'type' => 'consumption',
            'quantity' => -3,
            'balance_after' => 7,
        ]);

        $this->withHeaders($this->tokenHeaders($branchUser))
            ->postJson('/api/v1/branch/sales?branch_code=branch-1', $payload)
            ->assertOk()
            ->assertJsonPath('data.duplicate', true);

        $this->assertEquals(7.0, (float) $inventory->fresh()->current_stock);
        $this->assertDatabaseCount('branch_sales', 1);

        $this->withHeaders($this->tokenHeaders($otherBranchUser))
            ->getJson('/api/v1/branch/inventory?branch_code=branch-1')
            ->assertForbidden();

        $decimalPayload = [
            ...$payload,
            'client_reference' => 'device-transaction-decimal',
            'items' => [[
                'inventory_id' => $inventory->id,
                'quantity' => 0.5,
            ]],
        ];

        $this->withHeaders($this->tokenHeaders($branchUser))
            ->postJson('/api/v1/branch/sales?branch_code=branch-1', $decimalPayload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('items.0.quantity');

        $this->assertEquals(7.0, (float) $inventory->fresh()->current_stock);
    }

    public function test_admin_branch_overview_keeps_branch_stock_separate_and_returns_deductions(): void
    {
        $admin = $this->createUser(RoleName::Admin);
        $branchUser = $this->createUser(RoleName::Franchisee);
        $brand = Brand::create(['name' => 'Overview Brand', 'code' => 'OVERVIEW', 'is_active' => true]);
        $product = Product::create([
            'brand_id' => $brand->id,
            'sku' => 'OVERVIEW-001',
            'name' => 'Overview Product',
            'unit' => 'piece',
            'is_active' => true,
        ]);
        $location = $this->makeBranch($branchUser, $brand, 'branch-1', 'Overview Branch');
        Inventory::create([
            'location_id' => $location->id,
            'product_id' => $product->id,
            'current_stock' => 12,
            'reorder_level' => 5,
            'critical_level' => 2,
        ]);

        $this->withHeaders($this->tokenHeaders($admin))
            ->getJson('/api/v1/branches/overview')
            ->assertOk()
            ->assertJsonPath('data.summary.active_branches', 1)
            ->assertJsonPath('data.summary.total_units', 12)
            ->assertJsonPath('data.branches.0.branch_code', 'branch-1')
            ->assertJsonPath('data.branches.0.inventory.0.current_stock', 12);
    }

    private function makeBranch(User $user, Brand $brand, string $code, string $name): FranchiseLocation
    {
        $applicant = Applicant::create([
            'user_id' => $user->id,
            'preferred_brand_id' => $brand->id,
            'full_name' => $user->full_name,
            'email' => $user->email,
            'status' => ApplicantStatus::ActiveFranchisee,
            'application_date' => now()->subMonth()->toDateString(),
            'approved_at' => now()->subWeek(),
        ]);
        $franchisee = Franchisee::create([
            'applicant_id' => $applicant->id,
            'user_id' => $user->id,
            'business_name' => $name,
            'franchise_status' => 'active',
            'approval_date' => now()->subWeek()->toDateString(),
        ]);

        return FranchiseLocation::create([
            'franchisee_id' => $franchisee->id,
            'brand_id' => $brand->id,
            'branch_code' => $code,
            'name' => $name,
            'type' => LocationType::Franchise,
            'address' => $name.' Address',
            'is_active' => true,
        ]);
    }
}
