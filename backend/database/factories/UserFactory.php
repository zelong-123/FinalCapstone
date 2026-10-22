<?php

namespace Database\Factories;

use App\Enums\RoleName;
use App\Models\Role;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class UserFactory extends Factory
{
    protected static ?string $password;

    public function definition(): array
    {
        $role = Role::query()->firstOrCreate(
            ['name' => RoleName::Admin->value],
            ['label' => 'Administrator'],
        );

        return [
            'role_id' => $role->id,
            'full_name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'phone' => fake()->phoneNumber(),
            'password' => static::$password ??= Hash::make('Password123!'),
            'account_status' => 'active',
            'remember_token' => Str::random(10),
        ];
    }
}
