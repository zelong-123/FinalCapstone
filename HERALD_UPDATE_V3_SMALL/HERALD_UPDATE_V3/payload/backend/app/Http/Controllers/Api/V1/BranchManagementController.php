<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\LocationType;
use App\Enums\SupplyRequestStatus;
use App\Models\BranchSale;
use App\Models\FranchiseLocation;
use App\Models\SupplyRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BranchManagementController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $locations = FranchiseLocation::query()
            ->where('type', LocationType::Franchise->value)
            ->where('is_active', true)
            ->with([
                'brand:id,name,code',
                'franchisee.user:id,full_name,email',
                'inventories' => fn ($query) => $query
                    ->with('product:id,sku,name,unit')
                    ->orderBy('product_id'),
            ])
            ->orderBy('name')
            ->get();

        $locationIds = $locations->pluck('id');
        $recentSales = BranchSale::query()
            ->with(['items.product:id,sku,name,unit', 'recordedBy:id,full_name'])
            ->whereIn('location_id', $locationIds)
            ->latest()
            ->limit(80)
            ->get()
            ->groupBy('location_id');

        $requests = SupplyRequest::query()
            ->with(['items.product:id,sku,name,unit'])
            ->whereIn('location_id', $locationIds)
            ->latest()
            ->limit(80)
            ->get()
            ->groupBy('location_id');

        $openStatuses = [
            SupplyRequestStatus::Draft->value,
            SupplyRequestStatus::Submitted->value,
            SupplyRequestStatus::UnderReview->value,
            SupplyRequestStatus::Endorsed->value,
            SupplyRequestStatus::Preparing->value,
            SupplyRequestStatus::Dispatched->value,
        ];

        $branches = $locations->map(function (FranchiseLocation $location) use ($recentSales, $requests, $openStatuses): array {
            $inventory = $location->inventories;
            $sales = $recentSales->get($location->id, collect())->take(12)->values();
            $branchRequests = $requests->get($location->id, collect());
            $openRequests = $branchRequests->filter(fn ($item): bool => in_array($item->status->value, $openStatuses, true))->count();
            $lastSale = $sales->first();
            $lastRequest = $branchRequests->first();
            $lastActivity = collect([$lastSale?->created_at, $lastRequest?->updated_at])->filter()->sortDesc()->first();

            return [
                'id' => $location->id,
                'name' => $location->name,
                'branch_code' => $location->branch_code,
                'address' => $location->address,
                'city' => $location->city,
                'province' => $location->province,
                'contact_number' => $location->contact_number,
                'brand' => $location->brand,
                'operator' => $location->franchisee?->user,
                'portal_path' => '/'.$location->branch_code,
                'product_count' => $inventory->count(),
                'total_units' => (int) round((float) $inventory->sum('current_stock')),
                'low_stock_count' => $inventory->where('stock_status', 'low')->count(),
                'critical_stock_count' => $inventory->where('stock_status', 'critical')->count(),
                'open_request_count' => $openRequests,
                'last_activity_at' => $lastActivity?->toIso8601String(),
                'inventory' => $inventory->map(fn ($item): array => [
                    'id' => $item->id,
                    'product' => $item->product,
                    'current_stock' => (int) round((float) $item->current_stock),
                    'reorder_level' => (int) round((float) $item->reorder_level),
                    'critical_level' => (int) round((float) $item->critical_level),
                    'stock_status' => $item->stock_status,
                    'updated_at' => $item->updated_at?->toIso8601String(),
                ])->values(),
                'recent_deductions' => $sales->map(fn (BranchSale $sale): array => [
                    'id' => $sale->id,
                    'sale_number' => $sale->sale_number,
                    'notes' => $sale->notes,
                    'recorded_by' => $sale->recordedBy,
                    'total_quantity' => (int) round((float) $sale->items->sum('quantity')),
                    'items' => $sale->items->map(fn ($item): array => [
                        'id' => $item->id,
                        'product' => $item->product,
                        'quantity' => (int) round((float) $item->quantity),
                        'balance_before' => (int) round((float) $item->balance_before),
                        'balance_after' => (int) round((float) $item->balance_after),
                    ])->values(),
                    'created_at' => $sale->created_at?->toIso8601String(),
                ])->values(),
            ];
        })->values();

        return $this->success([
            'summary' => [
                'active_branches' => $branches->count(),
                'total_units' => $branches->sum('total_units'),
                'low_stock_items' => $branches->sum('low_stock_count'),
                'critical_stock_items' => $branches->sum('critical_stock_count'),
                'open_requests' => $branches->sum('open_request_count'),
            ],
            'branches' => $branches,
            'server_time' => now()->toIso8601String(),
        ]);
    }
}
