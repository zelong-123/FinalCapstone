<?php

namespace Database\Seeders;

use App\Enums\RoleName;
use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $labels = [
            RoleName::Marketing->value => 'Marketing Personnel',
            RoleName::Sales->value => 'Sales Personnel',
            RoleName::Admin->value => 'Administrator',
            RoleName::Logistics->value => 'Logistics Personnel',
            RoleName::Franchisee->value => 'Applicant / Franchisee',
        ];

        foreach ($labels as $name => $label) {
            Role::query()->updateOrCreate(['name' => $name], ['label' => $label]);
        }
    }
}
