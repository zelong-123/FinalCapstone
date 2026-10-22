<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ChatChannel extends Model
{
    use HasFactory;

    protected $fillable = [
        'slug',
        'name',
        'type',
        'department',
        'description',
    ];

    public function messages(): HasMany
    {
        return $this->hasMany(ChatMessage::class, 'channel_id');
    }

    public function members(): HasMany
    {
        return $this->hasMany(ChatChannelMember::class, 'channel_id');
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'chat_channel_members', 'channel_id', 'user_id')
            ->withPivot('last_read_message_id', 'last_read_at')
            ->withTimestamps();
    }
}
