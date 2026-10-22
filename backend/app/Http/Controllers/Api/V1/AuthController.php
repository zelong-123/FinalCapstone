<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\ApiToken;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends ApiController
{
    public function login(Request $request, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:100'],
        ]);

        /** @var User|null $user */
        $user = User::query()->with('role')->where('email', strtolower($validated['email']))->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The supplied credentials are incorrect.'],
            ]);
        }

        if ($user->account_status !== 'active') {
            return response()->json(['message' => 'This account is not active.'], 403);
        }

        $plainToken = bin2hex(random_bytes(40));
        $ttl = (int) config('franchise.api_token_ttl_minutes', 1440);

        ApiToken::create([
            'user_id' => $user->id,
            'name' => $validated['device_name'] ?? 'frontend',
            'token_hash' => hash('sha256', $plainToken),
            'expires_at' => $ttl > 0 ? now()->addMinutes($ttl) : null,
        ]);

        $audit->record('auth.login', $user, request: $request);

        return $this->success([
            'token' => $plainToken,
            'token_type' => 'Bearer',
            'expires_in_minutes' => $ttl > 0 ? $ttl : null,
            'user' => $user,
        ], 'Login successful.');
    }

    public function me(Request $request): JsonResponse
    {
        return $this->success($request->user()->loadMissing(['role', 'applicant', 'franchisee.locations.brand']));
    }

    public function logout(Request $request, AuditService $audit): JsonResponse
    {
        /** @var ApiToken|null $token */
        $token = $request->attributes->get('api_token');
        $audit->record('auth.logout', $request->user(), request: $request);
        $token?->delete();

        return $this->success(message: 'Logged out successfully.');
    }

    public function changePassword(Request $request, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:10', 'confirmed'],
        ]);

        $user = $request->user();
        if (! Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['The current password is incorrect.'],
            ]);
        }

        $user->update(['password' => $validated['password']]);
        $user->apiTokens()->whereKeyNot($request->attributes->get('api_token')?->id)->delete();
        $audit->record('auth.password_changed', $user, request: $request);

        return $this->success(message: 'Password changed successfully.');
    }
}
