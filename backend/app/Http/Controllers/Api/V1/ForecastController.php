<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Forecast;
use App\Models\Inventory;
use App\Services\AuditService;
use App\Services\ForecastService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ForecastController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $query = Forecast::query()->with(['inventory.product.brand', 'inventory.location', 'generatedBy:id,full_name']);
        if ($request->filled('inventory_id')) {
            $query->where('inventory_id', $request->integer('inventory_id'));
        }
        if ($request->filled('location_id')) {
            $query->whereHas('inventory', fn ($q) => $q->where('location_id', $request->integer('location_id')));
        }

        return $this->paginated($query->latest('generated_at')->paginate($this->perPage($request, 30)));
    }

    public function generate(Request $request, Inventory $inventory, ForecastService $service, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'periods' => ['nullable', 'integer', 'min:2', 'max:24'],
        ]);
        $periods = (int) ($validated['periods'] ?? config('franchise.forecast_default_periods', 3));
        $forecast = $service->generate($inventory, $periods, $request->user());
        $audit->record('forecast.generated', $forecast, newValues: $forecast->toArray(), request: $request);

        return $this->success($forecast->load(['inventory.product', 'inventory.location']), 'Forecast generated.', 201);
    }

    public function bulkGenerate(Request $request, ForecastService $service, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'location_id' => ['nullable', 'exists:franchise_locations,id'],
            'brand_id' => ['nullable', 'exists:brands,id'],
            'periods' => ['nullable', 'integer', 'min:2', 'max:24'],
        ]);
        $periods = (int) ($validated['periods'] ?? config('franchise.forecast_default_periods', 3));
        $inventories = Inventory::query()
            ->when(isset($validated['location_id']), fn ($q) => $q->where('location_id', $validated['location_id']))
            ->when(isset($validated['brand_id']), fn ($q) => $q->whereHas('product', fn ($p) => $p->where('brand_id', $validated['brand_id'])))
            ->get();

        $forecasts = $inventories->map(fn (Inventory $inventory) => $service->generate($inventory, $periods, $request->user()));
        $audit->record('forecast.bulk_generated', null, newValues: ['count' => $forecasts->count(), 'periods' => $periods], request: $request);

        $forecasts->each->load(['inventory.product', 'inventory.location']);

        return $this->success($forecasts, 'Forecasts generated.', 201);
    }
}
