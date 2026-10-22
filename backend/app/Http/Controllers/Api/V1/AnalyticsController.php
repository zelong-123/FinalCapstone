<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\ApplicantStatus;
use App\Enums\InquiryStatus;
use App\Enums\SupplyRequestStatus;
use App\Enums\PaymentStatus;
use App\Models\Applicant;
use App\Models\BranchSale;
use App\Models\Brand;
use App\Models\FranchiseInquiry;
use App\Models\FranchiseLocation;
use App\Models\Franchisee;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Payment;
use App\Models\SupplyRequest;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AnalyticsController extends ApiController
{
    public function overview(Request $request): JsonResponse
    {
        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        $from = $request->filled('from')
            ? CarbonImmutable::parse($request->string('from'))->startOfDay()
            : CarbonImmutable::now()->subMonths(11)->startOfMonth();
        $to = $request->filled('to')
            ? CarbonImmutable::parse($request->string('to'))->endOfDay()
            : CarbonImmutable::now()->endOfDay();

        if ($from->diffInMonths($to) > 35) {
            return response()->json(['message' => 'Analytics ranges are limited to 36 months.'], 422);
        }

        $inquiries = FranchiseInquiry::query()->whereBetween('inquiry_date', [$from->toDateString(), $to->toDateString()])->get(['status', 'source', 'inquiry_date', 'preferred_brand_id']);
        $applicants = Applicant::query()->whereBetween('application_date', [$from->toDateString(), $to->toDateString()])->get(['status', 'application_date', 'preferred_brand_id']);
        $requests = SupplyRequest::query()->whereBetween('created_at', [$from, $to])->get(['status', 'created_at', 'completed_at', 'location_id']);
        $inventories = Inventory::query()->get(['id', 'current_stock', 'reorder_level', 'critical_level', 'location_id', 'product_id']);

        $approvedCount = $applicants->whereIn('status', [ApplicantStatus::Approved, ApplicantStatus::ActiveFranchisee])->count();
        $conversionRate = $inquiries->count() > 0 ? round(($approvedCount / $inquiries->count()) * 100, 2) : 0;
        $completed = $requests->where('status', SupplyRequestStatus::Completed)->count();
        $fulfillmentRate = $requests->count() > 0 ? round(($completed / $requests->count()) * 100, 2) : 0;

        $monthCount = max(1, (int) $from->startOfMonth()->diffInMonths($to->startOfMonth()) + 1);
        $months = collect(range(0, $monthCount - 1))
            ->map(fn (int $i) => $from->startOfMonth()->addMonths($i));
        $inquiryTrend = $months->map(fn (CarbonImmutable $month) => [
            'period' => $month->format('Y-m'),
            'count' => $inquiries->filter(fn ($row) => CarbonImmutable::parse($row->inquiry_date)->format('Y-m') === $month->format('Y-m'))->count(),
        ]);
        $requestTrend = $months->map(fn (CarbonImmutable $month) => [
            'period' => $month->format('Y-m'),
            'submitted' => $requests->filter(fn ($row) => $row->created_at->format('Y-m') === $month->format('Y-m'))->count(),
            'completed' => $requests->filter(fn ($row) => $row->completed_at?->format('Y-m') === $month->format('Y-m'))->count(),
        ]);

        $inventoryStatus = [
            'normal' => $inventories->filter(fn ($row) => (float) $row->current_stock > (float) $row->reorder_level)->count(),
            'low' => $inventories->filter(fn ($row) => (float) $row->current_stock > (float) $row->critical_level && (float) $row->current_stock <= (float) $row->reorder_level)->count(),
            'critical' => $inventories->filter(fn ($row) => (float) $row->current_stock <= (float) $row->critical_level)->count(),
        ];

        $leadTimes = $requests->filter(fn ($row) => $row->completed_at !== null)
            ->map(fn ($row) => $row->created_at->diffInHours($row->completed_at));

        return $this->success([
            'period' => ['from' => $from->toIso8601String(), 'to' => $to->toIso8601String()],
            'kpis' => [
                'total_inquiries' => $inquiries->count(),
                'active_applicants' => Applicant::query()->whereNotIn('status', [ApplicantStatus::Rejected->value, ApplicantStatus::ActiveFranchisee->value])->count(),
                'active_franchise_locations' => FranchiseLocation::query()->where('is_active', true)->where('type', 'franchise')->count(),
                'conversion_rate_percent' => $conversionRate,
                'supply_requests' => $requests->count(),
                'fulfillment_rate_percent' => $fulfillmentRate,
                'average_fulfillment_hours' => $leadTimes->isNotEmpty() ? round((float) $leadTimes->average(), 2) : null,
                'critical_inventory_items' => $inventoryStatus['critical'],
            ],
            'inquiry_trend' => $inquiryTrend->values(),
            'supply_request_trend' => $requestTrend->values(),
            'inventory_status' => $inventoryStatus,
            'inquiries_by_source' => $inquiries->groupBy('source')->map->count()->sortDesc(),
            'applicant_funnel' => collect(ApplicantStatus::cases())->mapWithKeys(fn ($status) => [$status->value => $applicants->where('status', $status)->count()]),
            'supply_statuses' => collect(SupplyRequestStatus::cases())->mapWithKeys(fn ($status) => [$status->value => $requests->where('status', $status)->count()]),
        ]);
    }

    public function topLocations(Request $request): JsonResponse
    {
        $limit = max(1, min(50, $request->integer('limit', 10)));
        $locations = FranchiseLocation::query()
            ->where('type', 'franchise')
            ->withCount([
                'supplyRequests',
                'supplyRequests as completed_supply_requests_count' => fn ($q) => $q->where('status', SupplyRequestStatus::Completed->value),
            ])
            ->with(['brand:id,name', 'franchisee:id,business_name'])
            ->orderByDesc('completed_supply_requests_count')
            ->limit($limit)
            ->get();

        return $this->success($locations);
    }

    public function inventoryMovement(Request $request): JsonResponse
    {
        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'location_id' => ['nullable', 'exists:franchise_locations,id'],
        ]);

        $from = $request->filled('from')
            ? CarbonImmutable::parse($request->string('from'))->startOfDay()
            : CarbonImmutable::now()->subDays(29)->startOfDay();
        $to = $request->filled('to')
            ? CarbonImmutable::parse($request->string('to'))->endOfDay()
            : CarbonImmutable::now()->endOfDay();

        if ($from->diffInDays($to) > 366) {
            return response()->json(['message' => 'Inventory movement ranges are limited to 366 days.'], 422);
        }
        $transactions = InventoryTransaction::query()
            ->whereBetween('transaction_date', [$from, $to])
            ->when($request->filled('location_id'), fn ($q) => $q->whereHas('inventory', fn ($i) => $i->where('location_id', $request->integer('location_id'))))
            ->get(['type', 'quantity', 'transaction_date']);

        $days = collect(range(0, $from->diffInDays($to)))->map(fn (int $offset) => $from->addDays($offset));
        $series = $days->map(function (CarbonImmutable $day) use ($transactions): array {
            $rows = $transactions->filter(fn ($row) => $row->transaction_date->toDateString() === $day->toDateString());

            return [
                'date' => $day->toDateString(),
                'inbound' => round((float) $rows->filter(fn ($row) => (float) $row->quantity > 0)->sum('quantity'), 2),
                'outbound' => round(abs((float) $rows->filter(fn ($row) => (float) $row->quantity < 0)->sum('quantity')), 2),
            ];
        });

        return $this->success($series);
    }

    /**
     * Executive franchising view: sales trend, top performing branches, plain
     * language insights, warnings, and the newest franchise applications.
     */
    public function franchisingDashboard(Request $request): JsonResponse
    {
        $request->validate([
            'period' => ['nullable', Rule::in(['month', 'year'])],
            'limit' => ['nullable', 'integer', 'min:1', 'max:25'],
        ]);

        $period = $request->string('period')->toString() ?: 'month';
        $limit = max(1, min(25, $request->integer('limit', 8)));
        $format = $period === 'year' ? '%Y' : '%Y-%m';
        $buckets = $period === 'year' ? 6 : 12;
        $periodKey = $this->periodKeyExpression('branch_sales.created_at', $format);

        $salesBase = BranchSale::query()
            ->join('branch_sale_items', 'branch_sale_items.branch_sale_id', '=', 'branch_sales.id');

        // 1. Sales trend across the selected period.
        $trendRows = (clone $salesBase)
            ->selectRaw("{$periodKey} AS period_key")
            ->selectRaw('COUNT(DISTINCT branch_sales.id) AS sale_count')
            ->selectRaw('COALESCE(SUM(branch_sale_items.quantity), 0) AS quantity')
            ->groupBy('period_key')
            ->pluck('quantity', 'period_key');

        $saleCounts = (clone $salesBase)
            ->selectRaw("{$periodKey} AS period_key")
            ->selectRaw('COUNT(DISTINCT branch_sales.id) AS sale_count')
            ->groupBy('period_key')
            ->pluck('sale_count', 'period_key');

        $trendPeriods = collect(range(0, $buckets - 1))
            ->map(fn (int $i) => $period === 'year'
                ? CarbonImmutable::now()->subYears($buckets - 1 - $i)->startOfYear()
                : CarbonImmutable::now()->subMonths($buckets - 1 - $i)->startOfMonth());

        $salesTrend = $trendPeriods->map(function (CarbonImmutable $bucket) use ($period, $format, $trendRows, $saleCounts): array {
            $key = $bucket->format($format);

            return [
                'period' => $key,
                'label' => $period === 'year' ? $bucket->format('Y') : $bucket->format('M Y'),
                'sales' => (int) ($saleCounts[$key] ?? 0),
                'quantity' => round((float) ($trendRows[$key] ?? 0), 2),
            ];
        })->values();

        // 2. Top performing branches by quantity sold.
        $topBranches = FranchiseLocation::query()
            ->where('type', 'franchise')
            ->with(['brand:id,name', 'franchisee:id,business_name'])
            ->withCount(['sales as sale_count'])
            ->addSelect(['quantity' => (clone $salesBase)
                ->whereColumn('franchise_locations.id', '=', 'branch_sales.location_id')
                ->selectRaw('COALESCE(SUM(branch_sale_items.quantity), 0)'),
            ])
            ->orderByDesc('quantity')
            ->limit($limit)
            ->get()
            ->map(fn (FranchiseLocation $location, int $index) => [
                'location_id' => $location->id,
                'name' => $location->name,
                'branch_code' => $location->branch_code,
                'brand' => $location->brand?->name,
                'business_name' => $location->franchisee?->business_name,
                'sales' => (int) ($location->sale_count ?? 0),
                'quantity' => round((float) $location->quantity, 2),
                'rank' => $index + 1,
            ])->values();

        // 3. Insights: what is in demand right now.
        $weekStart = CarbonImmutable::now()->subDays(6)->startOfDay();
        $demandRows = (clone $salesBase)
            ->join('products', 'products.id', '=', 'branch_sale_items.product_id')
            ->where('branch_sales.created_at', '>=', $weekStart)
            ->select('products.name')
            ->selectRaw('SUM(branch_sale_items.quantity) AS quantity')
            ->groupBy('products.name')
            ->orderByDesc('quantity')
            ->limit(3)
            ->get();

        $insights = [];
        if ($demandRows->isNotEmpty()) {
            $names = $demandRows->pluck('name')->all();
            $insights[] = [
                'type' => 'demand',
                'message' => sprintf(
                    '%s %s in high demand this week.',
                    implode(', ', $names),
                    count($names) === 1 ? 'is' : 'are',
                ),
            ];
        }

        $activeApplicants = Applicant::query()->active()->count();
        $activeBranches = FranchiseLocation::query()->where('type', 'franchise')->where('is_active', true)->count();
        $insights[] = [
            'type' => 'coverage',
            'message' => "{$activeApplicants} candidates are in the pipeline across {$activeBranches} active branches.",
        ];

        $approved = Applicant::query()->active()
            ->whereIn('status', [ApplicantStatus::Approved->value, ApplicantStatus::ActiveFranchisee->value])->count();
        $insights[] = [
            'type' => 'conversion',
            'message' => $activeApplicants > 0
                ? sprintf('%d of %d pipeline candidates have been approved so far.', $approved, $activeApplicants)
                : 'No candidates are currently in the pipeline.',
        ];

        // 4. Alerts / warnings.
        $alerts = [];
        $criticalStock = Inventory::query()->whereColumn('current_stock', '<=', 'critical_level')->count();
        if ($criticalStock > 0) {
            $alerts[] = ['severity' => 'danger', 'message' => "{$criticalStock} inventory item(s) have reached the critical level."];
        }

        $stalled = Applicant::query()->active()
            ->where('status', ApplicantStatus::Scheduled->value)
            ->whereDoesntHave('schedules', fn ($q) => $q->where('starts_at', '>=', CarbonImmutable::now()->subDays(14)))
            ->count();
        if ($stalled > 0) {
            $alerts[] = ['severity' => 'warning', 'message' => "{$stalled} scheduled applicant(s) have no activity in the last 14 days."];
        }

        $pendingPayments = Payment::query()
            ->where('status', PaymentStatus::Pending->value)
            ->where('created_at', '<=', CarbonImmutable::now()->subDays(3))
            ->count();
        if ($pendingPayments > 0) {
            $alerts[] = ['severity' => 'warning', 'message' => "{$pendingPayments} payment(s) are awaiting verification."];
        }

        $openRequests = SupplyRequest::query()
            ->whereIn('status', [
                SupplyRequestStatus::Submitted->value,
                SupplyRequestStatus::UnderReview->value,
                SupplyRequestStatus::Endorsed->value,
                SupplyRequestStatus::Preparing->value,
                SupplyRequestStatus::Dispatched->value,
            ])
            ->where('target_delivery_date', '<', CarbonImmutable::now()->toDateString())
            ->count();
        if ($openRequests > 0) {
            $alerts[] = ['severity' => 'danger', 'message' => "{$openRequests} supply request(s) are past their target delivery date."];
        }

        // 5. Recent franchise applications.
        $recentApplications = Applicant::query()->active()
            ->with(['preferredBrand:id,name'])
            ->latest('application_date')
            ->latest('id')
            ->limit(6)
            ->get()
            ->map(fn (Applicant $applicant) => [
                'id' => $applicant->id,
                'full_name' => $applicant->full_name,
                'brand' => $applicant->preferredBrand?->name,
                'status' => $applicant->status->value,
                'application_date' => $applicant->application_date->toDateString(),
                'progress' => $applicant->progress,
            ])->values();

        return $this->success([
            'period' => $period,
            'sales_trend' => $salesTrend,
            'top_branches' => $topBranches,
            'insights' => $insights,
            'alerts' => $alerts,
            'recent_applications' => $recentApplications,
            'summary' => [
                'active_applicants' => $activeApplicants,
                'active_franchisees' => Franchisee::query()->where('franchise_status', 'active')->count(),
                'branches_with_sales' => FranchiseLocation::query()->whereHas('sales')->count(),
            ],
        ]);
    }

    /**
     * Group a datetime column into a period key, on either MySQL or SQLite.
     */
    private function periodKeyExpression(string $column, string $format): string
    {
        if (DB::connection()->getDriverName() === 'sqlite') {
            $sqliteFormat = $format === '%Y' ? '%Y' : '%Y-%m';
            return "strftime('{$sqliteFormat}', {$column})";
        }

        return "DATE_FORMAT({$column}, '{$format}')";
    }
}
