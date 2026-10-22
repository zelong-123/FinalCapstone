<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $query = AuditLog::query()->with('user:id,full_name,email')->latest('created_at');
        if ($request->filled('action')) {
            $query->where('action', $request->string('action'));
        }
        if ($request->filled('user_id')) {
            $query->where('user_id', $request->integer('user_id'));
        }
        if ($request->filled('auditable_type')) {
            $query->where('auditable_type', $request->string('auditable_type'));
        }

        return $this->paginated($query->paginate($this->perPage($request, 50)));
    }
}
