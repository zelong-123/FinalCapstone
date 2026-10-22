<?php

namespace Database\Seeders;

use App\Enums\ApplicantStatus;
use App\Enums\InventoryTransactionType;
use App\Enums\LocationType;
use App\Enums\RoleName;
use App\Models\Applicant;
use App\Models\ApplicantStatusHistory;
use App\Models\Brand;
use App\Models\Franchisee;
use App\Models\FranchiseLocation;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(RoleSeeder::class);
        $password = env('SEED_DEFAULT_PASSWORD', 'Password123!');

        $accounts = [
            ['role' => RoleName::Admin, 'name' => 'System Administrator', 'email' => 'admin@franchisetitan.local'],
            ['role' => RoleName::Marketing, 'name' => 'Marketing User', 'email' => 'marketing@franchisetitan.local'],
            ['role' => RoleName::Sales, 'name' => 'Sales User', 'email' => 'sales@franchisetitan.local'],
            ['role' => RoleName::Logistics, 'name' => 'Logistics User', 'email' => 'logistics@franchisetitan.local'],
            ['role' => RoleName::Franchisee, 'name' => 'Sample Franchisee', 'email' => 'franchisee@franchisetitan.local'],
        ];

        $users = [];
        foreach ($accounts as $account) {
            $role = Role::query()->where('name', $account['role']->value)->firstOrFail();
            $user = User::query()->firstOrNew(['email' => $account['email']]);
            $isNew = ! $user->exists;
            $user->fill([
                'role_id' => $role->id,
                'full_name' => $account['name'],
                'account_status' => 'active',
            ]);
            if ($isNew) {
                $user->password = Hash::make($password);
            }
            $user->save();
            $users[$account['role']->value] = $user;
        }

        $brandNames = ['Kkopi', 'GoDo', 'Daily Dash', 'La Pasta'];
        $brands = collect($brandNames)->mapWithKeys(function (string $name): array {
            $brand = Brand::query()->updateOrCreate(
                ['code' => str($name)->upper()->replace(' ', '_')->toString()],
                ['name' => $name, 'description' => "{$name} franchise brand", 'is_active' => true],
            );

            return [$name => $brand];
        });

        $warehouse = FranchiseLocation::query()->updateOrCreate(
            ['name' => 'Franchise Titan Central Warehouse'],
            [
                'type' => LocationType::Warehouse,
                'address' => 'Las Piñas City, Philippines',
                'city' => 'Las Piñas',
                'region' => 'NCR',
                'is_active' => true,
            ],
        );

        $products = collect();
        foreach ($brands as $brand) {
            foreach ([
                ['suffix' => 'BASE', 'name' => "{$brand->name} Base Ingredient", 'category' => 'Ingredients', 'unit' => 'pack'],
                ['suffix' => 'CUP', 'name' => "{$brand->name} Packaging Cup", 'category' => 'Packaging', 'unit' => 'piece'],
            ] as $item) {
                $product = Product::query()->updateOrCreate(
                    ['sku' => "{$brand->code}-{$item['suffix']}"],
                    [
                        'brand_id' => $brand->id,
                        'name' => $item['name'],
                        'category' => $item['category'],
                        'unit' => $item['unit'],
                        'is_active' => true,
                    ],
                );
                $products->push($product);
            }
        }

        foreach ($products as $product) {
            $inventory = Inventory::query()->firstOrCreate(
                ['location_id' => $warehouse->id, 'product_id' => $product->id],
                [
                    'current_stock' => 500,
                    'reorder_level' => 100,
                    'critical_level' => 50,
                    'last_counted_at' => now(),
                    'updated_by_user_id' => $users[RoleName::Logistics->value]->id,
                ],
            );
            $inventory->update([
                'reorder_level' => 100,
                'critical_level' => 50,
            ]);

            if (! $inventory->transactions()->exists()) {
                $openingBalance = (float) $inventory->current_stock;
                InventoryTransaction::create([
                    'inventory_id' => $inventory->id,
                    'type' => InventoryTransactionType::Opening,
                    'quantity' => $openingBalance,
                    'balance_before' => 0,
                    'balance_after' => $openingBalance,
                    'remarks' => 'Seed opening balance.',
                    'recorded_by_user_id' => $users[RoleName::Logistics->value]->id,
                    'transaction_date' => now(),
                ]);
            }
        }

        $franchiseeUser = $users[RoleName::Franchisee->value];
        $applicant = Applicant::query()->updateOrCreate(
            ['user_id' => $franchiseeUser->id],
            [
                'preferred_brand_id' => $brands['Kkopi']->id,
                'full_name' => $franchiseeUser->full_name,
                'email' => $franchiseeUser->email,
                'phone' => '09170000000',
                'address' => 'Las Piñas City',
                'status' => ApplicantStatus::ActiveFranchisee,
                'application_date' => now()->subMonths(2)->toDateString(),
                'approved_at' => now()->subMonth(),
            ],
        );
        ApplicantStatusHistory::query()->firstOrCreate([
            'applicant_id' => $applicant->id,
            'to_status' => ApplicantStatus::ActiveFranchisee,
        ], [
            'from_status' => ApplicantStatus::Approved,
            'remarks' => 'Seed franchisee account.',
            'changed_by_user_id' => $users[RoleName::Admin->value]->id,
        ]);

        $franchisee = Franchisee::query()->updateOrCreate(
            ['applicant_id' => $applicant->id],
            [
                'user_id' => $franchiseeUser->id,
                'business_name' => 'Kkopi Sample Branch',
                'franchise_status' => 'active',
                'approval_date' => now()->subMonth()->toDateString(),
            ],
        );

        $branch = FranchiseLocation::query()->updateOrCreate(
            ['franchisee_id' => $franchisee->id, 'name' => 'Kkopi - Las Piñas Sample'],
            [
                'brand_id' => $brands['Kkopi']->id,
                'type' => LocationType::Franchise,
                'address' => 'Las Piñas City, Philippines',
                'city' => 'Las Piñas',
                'region' => 'NCR',
                'contact_number' => '09170000000',
                'is_active' => true,
            ],
        );

        foreach ($products->where('brand_id', $brands['Kkopi']->id) as $product) {
            $sampleInventory = Inventory::query()->firstOrCreate(
                ['location_id' => $branch->id, 'product_id' => $product->id],
                [
                    'current_stock' => 30,
                    'reorder_level' => 20,
                    'critical_level' => 10,
                    'last_counted_at' => now(),
                    'updated_by_user_id' => $franchiseeUser->id,
                ],
            );
            $sampleInventory->update(['reorder_level' => 20, 'critical_level' => 10]);

            if (! $sampleInventory->transactions()->exists()) {
                $openingBalance = (float) $sampleInventory->current_stock;
                InventoryTransaction::create([
                    'inventory_id' => $sampleInventory->id,
                    'type' => InventoryTransactionType::Opening,
                    'quantity' => $openingBalance,
                    'balance_before' => 0,
                    'balance_after' => $openingBalance,
                    'remarks' => 'Seed sample branch opening balance.',
                    'recorded_by_user_id' => $franchiseeUser->id,
                    'transaction_date' => now(),
                ]);
            }
        }


        $branchRole = Role::query()->where('name', RoleName::Franchisee->value)->firstOrFail();
        $branchDefinitions = [
            ['code' => 'branch-1', 'name' => 'Herald Branch 1 - Las Piñas', 'email' => 'branch1@herald.local', 'brand' => 'Kkopi', 'address' => 'Las Piñas City, Philippines', 'phone' => '09171110001'],
            ['code' => 'branch-2', 'name' => 'Herald Branch 2 - Makati', 'email' => 'branch2@herald.local', 'brand' => 'GoDo', 'address' => 'Makati City, Philippines', 'phone' => '09171110002'],
            ['code' => 'branch-3', 'name' => 'Herald Branch 3 - Quezon City', 'email' => 'branch3@herald.local', 'brand' => 'Daily Dash', 'address' => 'Quezon City, Philippines', 'phone' => '09171110003'],
            ['code' => 'branch-4', 'name' => 'Herald Branch 4 - Pasig', 'email' => 'branch4@herald.local', 'brand' => 'La Pasta', 'address' => 'Pasig City, Philippines', 'phone' => '09171110004'],
        ];

        foreach ($branchDefinitions as $index => $definition) {
            $branchUser = User::query()->firstOrNew(['email' => $definition['email']]);
            $isNewBranchUser = ! $branchUser->exists;
            $branchUser->fill([
                'role_id' => $branchRole->id,
                'full_name' => "Branch ".($index + 1)." Operator",
                'phone' => $definition['phone'],
                'account_status' => 'active',
            ]);
            if ($isNewBranchUser) {
                $branchUser->password = Hash::make($password);
            }
            $branchUser->save();

            $branchApplicant = Applicant::query()->updateOrCreate(
                ['user_id' => $branchUser->id],
                [
                    'preferred_brand_id' => $brands[$definition['brand']]->id,
                    'full_name' => $branchUser->full_name,
                    'email' => $branchUser->email,
                    'phone' => $definition['phone'],
                    'address' => $definition['address'],
                    'status' => ApplicantStatus::ActiveFranchisee,
                    'application_date' => now()->subMonths(3)->toDateString(),
                    'approved_at' => now()->subMonths(2),
                ],
            );

            $branchFranchisee = Franchisee::query()->updateOrCreate(
                ['user_id' => $branchUser->id],
                [
                    'applicant_id' => $branchApplicant->id,
                    'business_name' => $definition['name'],
                    'franchise_status' => 'active',
                    'approval_date' => now()->subMonths(2)->toDateString(),
                ],
            );

            $branchLocation = FranchiseLocation::query()->updateOrCreate(
                ['branch_code' => $definition['code']],
                [
                    'franchisee_id' => $branchFranchisee->id,
                    'brand_id' => $brands[$definition['brand']]->id,
                    'name' => $definition['name'],
                    'type' => LocationType::Franchise,
                    'address' => $definition['address'],
                    'city' => str($definition['address'])->before(' City')->toString(),
                    'region' => 'NCR',
                    'contact_number' => $definition['phone'],
                    'is_active' => true,
                ],
            );

            foreach ($products->where('brand_id', $brands[$definition['brand']]->id) as $product) {
                $openingStock = 40 + ($index * 10);
                $branchInventory = Inventory::query()->firstOrCreate(
                    ['location_id' => $branchLocation->id, 'product_id' => $product->id],
                    [
                        'current_stock' => $openingStock,
                        'reorder_level' => 20,
                        'critical_level' => 10,
                        'last_counted_at' => now(),
                        'updated_by_user_id' => $branchUser->id,
                    ],
                );
                $branchInventory->update(['reorder_level' => 20, 'critical_level' => 10]);

                if (! $branchInventory->transactions()->exists()) {
                    $openingBalance = (float) $branchInventory->current_stock;
                    InventoryTransaction::create([
                        'inventory_id' => $branchInventory->id,
                        'type' => InventoryTransactionType::Opening,
                        'quantity' => $openingBalance,
                        'balance_before' => 0,
                        'balance_after' => $openingBalance,
                        'remarks' => 'Seed branch opening balance.',
                        'recorded_by_user_id' => $branchUser->id,
                        'transaction_date' => now(),
                    ]);
                }
            }
        }
    }
}
