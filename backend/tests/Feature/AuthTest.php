<?php

namespace Tests\Feature;

use App\Enums\RoleName;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesApiUsers;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use AuthenticatesApiUsers, RefreshDatabase;

    public function test_user_can_login_read_profile_and_logout(): void
    {
        $user = $this->createUser(RoleName::Admin, [
            'email' => 'admin@example.test',
            'password' => 'CorrectPassword123!',
        ]);

        $login = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'CorrectPassword123!',
            'device_name' => 'phpunit',
        ])->assertOk()
            ->assertJsonPath('data.user.email', 'admin@example.test')
            ->assertJsonPath('data.token_type', 'Bearer');

        $token = $login->json('data.token');
        $headers = ['Authorization' => 'Bearer '.$token, 'Accept' => 'application/json'];

        $this->withHeaders($headers)->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.role.name', 'admin');

        $this->withHeaders($headers)->postJson('/api/v1/auth/logout')->assertOk();
        $this->withHeaders($headers)->getJson('/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_invalid_credentials_are_rejected(): void
    {
        $this->createUser(RoleName::Admin, ['email' => 'admin@example.test']);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@example.test',
            'password' => 'wrong-password',
        ])->assertUnprocessable();
    }
}
