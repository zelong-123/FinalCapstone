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
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesApiUsers;
use Tests\TestCase;

class SupplyWorkflowTest extends TestCase
{
    use AuthenticatesApiUsers, RefreshDatabase;

    public function test_supply_request_moves_through_fulfillment_and_updates_inventory(): void
    {
        $franchiseeUser = $this->createUser(RoleName::Franchisee);
        $admin = $this->createUser(RoleName::Admin);
        $logistics = $this->createUser(RoleName::Logistics);

        $brand = Brand::create(['name' => 'Test Brand', 'code' => 'TEST', 'is_active' => true]);
        $product = Product::create([
            'brand_id' => $brand->id,
            'sku' => 'TEST-001',
            'name' => 'Test Product',
            'unit' => 'pack',
            'is_active' => true,
        ]);
        $applicant = Applicant::create([
            'user_id' => $franchiseeUser->id,
            'preferred_brand_id' => $brand->id,
            'full_name' => $franchiseeUser->full_name,
            'email' => $franchiseeUser->email,
            'status' => ApplicantStatus::ActiveFranchisee,
            'application_date' => now()->subMonth()->toDateString(),
            'approved_at' => now()->subWeek(),
        ]);
        $franchisee = Franchisee::create([
            'applicant_id' => $applicant->id,
            'user_id' => $franchiseeUser->id,
            'business_name' => 'Test Branch',
            'franchise_status' => 'active',
            'approval_date' => now()->subWeek()->toDateString(),
        ]);
        $warehouse = FranchiseLocation::create([
            'name' => 'Central Warehouse',
            'type' => LocationType::Warehouse,
            'address' => 'Warehouse Address',
            'is_active' => true,
        ]);
        $branch = FranchiseLocation::create([
            'franchisee_id' => $franchisee->id,
            'brand_id' => $brand->id,
            'name' => 'Test Branch Location',
            'type' => LocationType::Franchise,
            'address' => 'Branch Address',
            'is_active' => true,
        ]);
        $warehouseInventory = Inventory::create([
            'location_id' => $warehouse->id,
            'product_id' => $product->id,
            'current_stock' => 100,
            'reorder_level' => 20,
            'critical_level' => 10,
        ]);

        $create = $this->withHeaders($this->tokenHeaders($franchiseeUser))
            ->postJson('/api/v1/supply-requests', [
                'location_id' => $branch->id,
                'delivery_address' => 'Branch Address',
                'items' => [[
                    'product_id' => $product->id,
                    'quantity_requested' => 25,
                ]],
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'submitted');

        $requestId = $create->json('data.id');
        $adminHeaders = $this->tokenHeaders($admin);
        $logisticsHeaders = $this->tokenHeaders($logistics);

        foreach (['under_review', 'endorsed'] as $status) {
            $this->withHeaders($adminHeaders)
                ->patchJson("/api/v1/supply-requests/{$requestId}/status", ['status' => $status])
                ->assertOk()
                ->assertJsonPath('data.status', $status);
        }

        // Logistics picks the endorsed order up (preparing) before dispatching it.
        $this->withHeaders($logisticsHeaders)
            ->patchJson("/api/v1/supply-requests/{$requestId}/status", ['status' => 'preparing'])
            ->assertOk()
            ->assertJsonPath('data.status', 'preparing');

        // Warehouse stock is deducted the moment the order is dispatched.
        $this->withHeaders($logisticsHeaders)
            ->patchJson("/api/v1/supply-requests/{$requestId}/status", ['status' => 'dispatched'])
            ->assertOk()
            ->assertJsonPath('data.status', 'dispatched');
        $this->assertEquals(75.0, (float) $warehouseInventory->fresh()->current_stock);
        // The branch is only restocked when the delivery is confirmed, so no
        // branch inventory row exists yet while the goods are in transit.
        $this->assertDatabaseMissing('inventories', [
            'location_id' => $branch->id,
            'product_id' => $product->id,
        ]);

        // Confirming the delivery immediately adds the stock to the branch, so
        // logistics never has to also press "Complete" for the branch to be restocked.
        $this->withHeaders($logisticsHeaders)
            ->patchJson("/api/v1/supply-requests/{$requestId}/status", ['status' => 'delivered'])
            ->assertOk()
            ->assertJsonPath('data.status', 'delivered');
        $this->assertEquals(75.0, (float) $warehouseInventory->fresh()->current_stock);
        $this->assertDatabaseHas('inventories', [
            'location_id' => $branch->id,
            'product_id' => $product->id,
            'current_stock' => 25,
        ]);

        // Completing the request must not deduct the warehouse a second time.
        $this->withHeaders($logisticsHeaders)
            ->patchJson("/api/v1/supply-requests/{$requestId}/status", ['status' => 'completed'])
            ->assertOk()
            ->assertJsonPath('data.status', 'completed');
        $this->assertEquals(75.0, (float) $warehouseInventory->fresh()->current_stock);
        $this->assertDatabaseHas('inventories', [
            'location_id' => $branch->id,
            'product_id' => $product->id,
            'current_stock' => 25,
        ]);
        $this->assertDatabaseHas('supply_requests', [
            'id' => $requestId,
            'status' => 'completed',
        ]);
    }
}
