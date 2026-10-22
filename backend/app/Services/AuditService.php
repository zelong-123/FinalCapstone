<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class AuditService
{
    public function record(
        string $action,
        ?Model $model = null,
        array $oldValues = [],
        array $newValues = [],
        ?Request $request = null,
    ): AuditLog {
        return AuditLog::create([
            'user_id' => $request?->user()?->id ?? ($model instanceof User ? $model->id : null),
            'action' => $action,
            'auditable_type' => $model ? $model::class : null,
            'auditable_id' => $model?->getKey(),
            'old_values' => $oldValues ?: null,
            'new_values' => $newValues ?: null,
            'ip_address' => $request?->ip(),
            'user_agent' => $request?->userAgent(),
            'created_at' => now(),
        ]);
    }
}
