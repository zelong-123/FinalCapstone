<?php

namespace Tests\Concerns;

use App\Enums\RoleName;
use App\Models\ApiToken;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;

trait AuthenticatesApiUsers
{
    protected function createUser(RoleName $role, array $attributes = []): User
    {
        $this->seed(RoleSeeder::class);
        $roleModel = Role::query()->where('name', $role->value)->firstOrFail();

        return User::factory()->create([
            'role_id' => $roleModel->id,
            ...$attributes,
        ])->load('role');
    }

    /** @return array{Authorization: string, Accept: string} */
    protected function tokenHeaders(User $user): array
    {
        $plain = bin2hex(random_bytes(40));
        ApiToken::create([
            'user_id' => $user->id,
            'name' => 'test',
            'token_hash' => hash('sha256', $plain),
            'expires_at' => now()->addHour(),
        ]);

        return [
            'Authorization' => 'Bearer '.$plain,
            'Accept' => 'application/json',
        ];
    }
}
