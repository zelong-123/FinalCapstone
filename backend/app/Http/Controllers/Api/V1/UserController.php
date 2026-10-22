<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\RoleName;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $query = User::query()->with('role')->orderBy('full_name');

        if ($request->filled('role')) {
            $query->whereHas('role', fn ($q) => $q->where('name', $request->string('role')));
        }
        if ($request->filled('status')) {
            $query->where('account_status', $request->string('status'));
        }
        if ($request->filled('search')) {
            $term = '%'.$request->string('search').'%';
            $query->where(fn ($q) => $q->where('full_name', 'like', $term)->orWhere('email', 'like', $term));
        }

        return $this->paginated($query->paginate($this->perPage($request, 20)));
    }

    public function store(Request $request, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'full_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:50'],
            'password' => ['required', 'string', 'min:10'],
            'role' => ['required', Rule::enum(RoleName::class)],
            'account_status' => ['nullable', Rule::in(['active', 'inactive', 'suspended'])],
        ]);

        $role = Role::query()->where('name', $validated['role'])->firstOrFail();
        $user = User::create([
            'role_id' => $role->id,
            'full_name' => $validated['full_name'],
            'email' => strtolower($validated['email']),
            'phone' => $validated['phone'] ?? null,
            'password' => $validated['password'],
            'account_status' => $validated['account_status'] ?? 'active',
        ]);

        $audit->record('user.created', $user, newValues: $user->only(['full_name', 'email', 'role_id', 'account_status']), request: $request);

        return $this->success($user->load('role'), 'User account created.', 201);
    }

    public function show(User $user): JsonResponse
    {
        return $this->success($user->load(['role', 'applicant', 'franchisee.locations.brand']));
    }

    public function update(Request $request, User $user, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'full_name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:50'],
            'password' => ['nullable', 'string', 'min:10'],
            'role' => ['sometimes', Rule::enum(RoleName::class)],
            'account_status' => ['sometimes', Rule::in(['active', 'inactive', 'suspended'])],
        ]);

        $old = $user->only(['full_name', 'email', 'phone', 'role_id', 'account_status']);
        if (isset($validated['role'])) {
            $validated['role_id'] = Role::query()->where('name', $validated['role'])->value('id');
            unset($validated['role']);
        }
        if (isset($validated['email'])) {
            $validated['email'] = strtolower($validated['email']);
        }
        if (empty($validated['password'])) {
            unset($validated['password']);
        }

        $user->update($validated);
        $audit->record('user.updated', $user, $old, $user->fresh()->only(array_keys($old)), $request);

        return $this->success($user->fresh('role'), 'User account updated.');
    }

    public function destroy(Request $request, User $user, AuditService $audit): JsonResponse
    {
        if ($request->user()->is($user)) {
            return response()->json(['message' => 'You cannot deactivate your own account.'], 422);
        }

        $old = $user->only(['account_status']);
        $user->update(['account_status' => 'inactive']);
        $user->apiTokens()->delete();
        $audit->record('user.deactivated', $user, $old, ['account_status' => 'inactive'], $request);

        return $this->success(message: 'User account deactivated.');
    }
}
