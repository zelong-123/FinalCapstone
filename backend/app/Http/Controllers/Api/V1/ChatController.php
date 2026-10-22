<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\ChatChannel;
use App\Models\ChatChannelMember;
use App\Models\ChatMessage;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ChatController extends ApiController
{
    /**
     * Get all accessible channels (departments + direct messages) with unread counts and latest messages.
     */
    public function channels(Request $request): JsonResponse
    {
        $user = $request->user();
        $onlineThreshold = now()->subMinutes(3);

        // Fetch department channels
        $departmentChannels = ChatChannel::query()
            ->where('type', 'department')
            ->orderBy('id', 'asc')
            ->get();

        // Fetch direct message channels where the user is a member
        $directChannels = ChatChannel::query()
            ->where('type', 'direct')
            ->whereHas('members', fn ($query) => $query->where('user_id', $user->id))
            ->with(['members.user.role'])
            ->orderBy('updated_at', 'desc')
            ->get();

        $allChannels = $departmentChannels->concat($directChannels);
        $channelIds = $allChannels->pluck('id')->all();

        // Get user's read receipts
        $memberships = ChatChannelMember::query()
            ->where('user_id', $user->id)
            ->whereIn('channel_id', $channelIds)
            ->get()
            ->keyBy('channel_id');

        // Get latest message for each channel
        $latestMessages = ChatMessage::query()
            ->whereIn('id', function ($query) use ($channelIds) {
                $query->selectRaw('MAX(id)')
                    ->from('chat_messages')
                    ->whereIn('channel_id', $channelIds)
                    ->groupBy('channel_id');
            })
            ->with(['user.role'])
            ->get()
            ->keyBy('channel_id');

        // Calculate unread counts per channel
        $unreadCounts = [];
        foreach ($allChannels as $chan) {
            $lastReadId = $memberships->get($chan->id)?->last_read_message_id ?? 0;
            $unread = ChatMessage::query()
                ->where('channel_id', $chan->id)
                ->where('user_id', '!=', $user->id)
                ->where('id', '>', $lastReadId)
                ->count();
            $unreadCounts[$chan->id] = $unread;
        }

        $formatted = $allChannels->map(function (ChatChannel $chan) use ($user, $memberships, $latestMessages, $unreadCounts, $onlineThreshold) {
            $isDirect = $chan->type === 'direct';
            $otherUser = null;

            if ($isDirect) {
                $otherMember = $chan->members->firstWhere('user_id', '!=', $user->id);
                $otherUser = $otherMember?->user;
            }

            $displayName = $isDirect && $otherUser ? $otherUser->full_name : $chan->name;
            $displayRole = $isDirect && $otherUser ? ($otherUser->role?->label ?? $otherUser->role?->name) : null;
            $isOnline = $isDirect && $otherUser ? ($otherUser->last_seen_at && $otherUser->last_seen_at >= $onlineThreshold) : null;

            return [
                'id' => $chan->id,
                'slug' => $chan->slug,
                'name' => $displayName,
                'type' => $chan->type,
                'department' => $chan->department,
                'description' => $chan->description,
                'role_label' => $displayRole,
                'is_online' => $isOnline,
                'other_user_id' => $otherUser?->id,
                'unread_count' => $unreadCounts[$chan->id] ?? 0,
                'last_message' => $latestMessages->get($chan->id),
                'updated_at' => $chan->updated_at,
            ];
        });

        return $this->success($formatted);
    }

    /**
     * Get messages in a specific channel. Supports incremental polling with `since_id`.
     */
    public function messages(Request $request, ChatChannel $channel): JsonResponse
    {
        $user = $request->user();

        // Direct channel access control
        if ($channel->type === 'direct') {
            $isMember = ChatChannelMember::query()
                ->where('channel_id', $channel->id)
                ->where('user_id', $user->id)
                ->exists();
            abort_unless($isMember, 403, 'You do not have access to this conversation.');
        }

        $sinceId = $request->integer('since_id');

        if ($sinceId > 0) {
            // Incremental polling for new messages
            $messages = ChatMessage::query()
                ->where('channel_id', $channel->id)
                ->where('id', '>', $sinceId)
                ->with(['user.role'])
                ->orderBy('id', 'asc')
                ->limit(50)
                ->get();
        } else {
            // Initial load: get last 60 messages
            $messages = ChatMessage::query()
                ->where('channel_id', $channel->id)
                ->with(['user.role'])
                ->orderBy('id', 'desc')
                ->limit(60)
                ->get()
                ->reverse()
                ->values();
        }

        // Fix for the "auto seen" bug: fetching messages must never mark them seen.
        // The client explicitly sends `mark_read=1` when the user is actually
        // looking at the conversation, otherwise the unread badge stays.
        $latestMessage = $messages->last();
        if ($latestMessage && $request->boolean('mark_read')) {
            ChatChannelMember::updateOrCreate(
                ['channel_id' => $channel->id, 'user_id' => $user->id],
                ['last_read_message_id' => $latestMessage->id, 'last_read_at' => now()]
            );
        }

        return $this->success([
            'channel' => [
                'id' => $channel->id,
                'slug' => $channel->slug,
                'name' => $channel->name,
                'type' => $channel->type,
                'department' => $channel->department,
                'description' => $channel->description,
            ],
            'messages' => $messages,
        ]);
    }

    /**
     * Send a message to a channel.
     */
    public function sendMessage(Request $request, ChatChannel $channel): JsonResponse
    {
        $request->validate([
            'message' => ['required', 'string', 'min:1', 'max:5000'],
        ]);

        $user = $request->user();

        if ($channel->type === 'direct') {
            $isMember = ChatChannelMember::query()
                ->where('channel_id', $channel->id)
                ->where('user_id', $user->id)
                ->exists();
            abort_unless($isMember, 403, 'You do not have access to this conversation.');
        }

        $messageText = trim($request->input('message'));

        $chatMessage = ChatMessage::create([
            'channel_id' => $channel->id,
            'user_id' => $user->id,
            'message' => $messageText,
        ]);

        $channel->touch();

        // Mark as read for sender
        ChatChannelMember::updateOrCreate(
            ['channel_id' => $channel->id, 'user_id' => $user->id],
            ['last_read_message_id' => $chatMessage->id, 'last_read_at' => now()]
        );

        // Update sender activity
        $user->forceFill(['last_seen_at' => now()])->save();

        $chatMessage->load(['user.role']);

        return $this->success($chatMessage, 'Message sent.', 201);
    }

    /**
     * Find or create a direct 1-on-1 channel with another user.
     */
    public function direct(Request $request): JsonResponse
    {
        $request->validate([
            'recipient_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $user = $request->user();
        $recipientId = $request->integer('recipient_id');

        if ($user->id === $recipientId) {
            return response()->json(['message' => 'You cannot start a direct chat with yourself.'], 422);
        }

        $recipient = User::with('role')->findOrFail($recipientId);

        $minId = min($user->id, $recipientId);
        $maxId = max($user->id, $recipientId);
        $slug = "dm_{$minId}_{$maxId}";

        $channel = ChatChannel::firstOrCreate(
            ['slug' => $slug],
            [
                'name' => "Chat with {$recipient->full_name}",
                'type' => 'direct',
                'description' => "Direct message between {$user->full_name} and {$recipient->full_name}",
            ]
        );

        // Ensure both users are members
        ChatChannelMember::firstOrCreate(['channel_id' => $channel->id, 'user_id' => $user->id]);
        ChatChannelMember::firstOrCreate(['channel_id' => $channel->id, 'user_id' => $recipientId]);

        return $this->success([
            'id' => $channel->id,
            'slug' => $channel->slug,
            'name' => $recipient->full_name,
            'role_label' => $recipient->role?->label ?? $recipient->role?->name,
            'is_online' => $recipient->last_seen_at && $recipient->last_seen_at >= now()->subMinutes(3),
            'other_user_id' => $recipient->id,
            'type' => 'direct',
        ]);
    }

    /**
     * User presence heartbeat and fast unread summary.
     */
    public function heartbeat(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->forceFill(['last_seen_at' => now()])->save();

        $onlineThreshold = now()->subMinutes(3);

        $onlineCount = User::query()
            ->whereNotNull('last_seen_at')
            ->where('last_seen_at', '>=', $onlineThreshold)
            ->count();

        // Calculate total unread messages across all channels
        $memberships = ChatChannelMember::query()
            ->where('user_id', $user->id)
            ->pluck('last_read_message_id', 'channel_id');

        $accessibleChannelIds = ChatChannel::query()
            ->where('type', 'department')
            ->orWhere(fn ($q) => $q->where('type', 'direct')->whereIn('id', $memberships->keys()))
            ->pluck('id');

        $totalUnread = 0;
        foreach ($accessibleChannelIds as $chanId) {
            $lastRead = $memberships[$chanId] ?? 0;
            $unread = ChatMessage::query()
                ->where('channel_id', $chanId)
                ->where('user_id', '!=', $user->id)
                ->where('id', '>', $lastRead)
                ->count();
            $totalUnread += $unread;
        }

        return $this->success([
            'online_count' => $onlineCount,
            'total_unread' => $totalUnread,
            'timestamp' => now()->toISOString(),
        ]);
    }

    /**
     * Directory of colleagues grouped by department for direct messaging.
     */
    public function directory(Request $request): JsonResponse
    {
        $currentUserId = $request->user()->id;
        $onlineThreshold = now()->subMinutes(3);

        $users = User::query()
            ->with('role')
            ->where('id', '!=', $currentUserId)
            ->where('account_status', 'active')
            ->orderBy('full_name', 'asc')
            ->get()
            ->map(function (User $u) use ($onlineThreshold) {
                return [
                    'id' => $u->id,
                    'full_name' => $u->full_name,
                    'email' => $u->email,
                    'department' => $u->role?->name,
                    'role_label' => $u->role?->label ?? $u->role?->name,
                    'is_online' => (bool) ($u->last_seen_at && $u->last_seen_at >= $onlineThreshold),
                    'last_seen_at' => $u->last_seen_at,
                ];
            });

        return $this->success($users);
    }
}
