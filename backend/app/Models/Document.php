<?php

namespace App\Models;

use App\Enums\DocumentType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Document extends Model
{
    use HasFactory;

    protected $fillable = [
        'documentable_type', 'documentable_id', 'type', 'original_name', 'stored_name',
        'disk', 'path', 'mime_type', 'size_bytes', 'uploaded_by_user_id', 'metadata',
    ];

    protected function casts(): array
    {
        return [
            'type' => DocumentType::class,
            'metadata' => 'array',
        ];
    }

    public function documentable(): MorphTo
    {
        return $this->morphTo();
    }

    public function uploadedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by_user_id');
    }
}
