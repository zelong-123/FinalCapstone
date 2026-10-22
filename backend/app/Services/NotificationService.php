<?php

namespace App\Services;

use App\Models\Role;
use App\Models\SystemNotification;
use App\Models\User;
use Illuminate\Support\Collection;

class NotificationService
{
    public function notifyUser(User|int $user, string $type, string $title, string $message, array $data = []): SystemNotification
    {
        return SystemNotification::create([
            'user_id' => $user instanceof User ? $user->id : $user,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'data' => $data ?: null,
        ]);
    }

    public function notifyRoles(array $roles, string $type, string $title, string $message, array $data = []): Collection
    {
        $roleIds = Role::query()->whereIn('name', $roles)->pluck('id');
        $users = User::query()->whereIn('role_id', $roleIds)->where('account_status', 'active')->get();

        return $users->map(fn (User $user) => $this->notifyUser($user, $type, $title, $message, $data));
    }
}
