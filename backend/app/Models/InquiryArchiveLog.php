<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InquiryArchiveLog extends Model
{
    protected $fillable = [
        'archive_id', 'franchise_inquiry_id', 'lead_name', 'original_display_no',
        'archived_by_user_id', 'archived_at', 'restored_at', 'restored_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'archived_at' => 'datetime',
            'restored_at' => 'datetime',
        ];
    }
}
