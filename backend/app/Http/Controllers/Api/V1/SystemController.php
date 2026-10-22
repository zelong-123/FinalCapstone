<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\InventoryTransaction;
use App\Models\SupplyRequest;
use App\Models\SupplyRequestStatusHistory;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class SystemController extends ApiController
{
    public function health(): JsonResponse
    {
        $database = 'ok';
        try {
            DB::select('select 1');
        } catch (\Throwable) {
            $database = 'unavailable';
        }

        $status = $database === 'ok' ? 200 : 503;

        return response()->json([
            'status' => $status === 200 ? 'ok' : 'degraded',
            'database' => $database,
            'time' => now()->toIso8601String(),
            'version' => '2.0.0',
        ], $status);
    }

    public function syncStatus(): JsonResponse
    {
        return $this->success([
            'inventory_version' => (int) InventoryTransaction::query()->max('id'),
            'supply_request_version' => implode(':', [
                (int) SupplyRequest::query()->max('id'),
                (int) SupplyRequestStatusHistory::query()->max('id'),
                (string) (SupplyRequest::query()->max('updated_at') ?? ''),
            ]),
            'server_time' => now()->toIso8601String(),
        ]);
    }

}
