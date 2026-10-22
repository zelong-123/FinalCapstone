<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\SystemNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $query = $request->user()->hasMany(SystemNotification::class)->latest();
        if ($request->boolean('unread_only')) {
            $query->whereNull('read_at');
        }

        return $this->paginated($query->paginate($this->perPage($request, 30)));
    }

    public function markRead(Request $request, SystemNotification $notification): JsonResponse
    {
        abort_unless($notification->user_id === $request->user()->id, 404);
        $notification->update(['read_at' => now()]);

        return $this->success($notification, 'Notification marked as read.');
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $request->user()->hasMany(SystemNotification::class)->whereNull('read_at')->update(['read_at' => now()]);

        return $this->success(message: 'All notifications marked as read.');
    }
}
