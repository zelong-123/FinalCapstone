<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\InventoryTransactionType;
use App\Enums\LocationType;
use App\Enums\SupplyRequestStatus;
use App\Models\Inventory;
use App\Models\BranchSale;
use App\Models\FranchiseLocation;
use App\Models\SupplyRequest;
use App\Models\SupplyRequestItem;
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
            $openRequestCollection = $branchRequests->filter(fn ($item): bool => in_array($item->status->value, $openStatuses, true));
            $openRequests = (int) $openRequestCollection->count();
            $lastSale = $sales->first();
            $lastRequest = $branchRequests->first();
            $lastActivity = collect([$lastSale?->created_at, $lastRequest?->updated_at])->filter()->sortDesc()->first();

            // Needs-attention: low/critical items with no open request, overdue dispatched/delivered orders.
            $needsAttention = [];
            $criticalItems = $inventory->where('stock_status', 'critical');
            foreach ($criticalItems as $item) {
                $needsAttention[] = [
                    'label' => $item->product->name,
                    'alert' => 'Critical stock',
                    'detail' => 'No open supply requests for this item.',
                ];
            }

            $dispatchOverdue = $branchRequests
                ->filter(fn (SupplyRequest $sr): bool => in_array($sr->status->value, [SupplyRequestStatus::Dispatched->value, SupplyRequestStatus::Delivered->value]))
                ->filter(fn (SupplyRequest $sr): bool => optional($sr->target_delivery_date)->lt(now()));

            foreach ($dispatchOverdue as $sr) {
                $needsAttention[] = [
                    'label' => $sr->request_number,
                    'alert' => 'Overdue shipment',
                    'detail' => 'Dispatched/delivered but past target delivery date.',
                ];
            }

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
                'total_units' => $location->total_units,
                'low_stock_count' => (int) $location->low_stock_count,
                'critical_stock_count' => (int) $location->critical_stock_count,
                'open_request_count' => (int) $openRequests,
                'open_supply_requests' => $openRequestCollection->values()->map(fn (SupplyRequest $sr): array => [
                    'id' => $sr->id,
                    'request_number' => $sr->request_number,
                    'status' => $sr->status->value,
                    'target_delivery_date' => $sr->target_delivery_date?->toDateString(),
                    'items' => $sr->items->map(fn (SupplyRequestItem $item): array => [
                        'product' => $item->product->only(['name']),
                        'quantity_requested' => (int) round((float) $item->quantity_requested),
                    ])->values(),
                ])->values(),
                'needs_attention' => $needsAttention,
                'last_delivery' => $location->lastDelivery?->only(['delivered_at']),
                'next_delivery_target' => $location->next_delivery_target,
                'last_activity_at' => $lastActivity?->toIso8601String(),
                'inventory' => $inventory->map(fn ($item): array => [
                    'id' => $item->id,
                    'product' => $item->product,
                    'current_stock' => (int) round((float) $item->current_stock),
                    'reorder_level' => (int) round((float) $item->reorder_level),
                    'critical_level' => (int) round((float) $item->critical_level),
                    'stock_status' => $item->stock_status,
                    'estimated_days_left' => $item->estimated_days_left,
                    'updated_at' => $item->updated_at?->toIso8601String(),
                ])->values(),
                'recent_deductions' => $sales->map(fn (BranchSale $sale): array => [
                    'id' => $sale->id,
                    'sale_number' => $sale->sale_number,
                    'notes' => $sale->notes,
                    'recorded_by' => $sale->recordedBy,
                    'total_quantity' => (int) round((float) $sale->total_quantity),
                    'items' => $sale->items->map(fn (BranchSaleItem $item): array => [
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
