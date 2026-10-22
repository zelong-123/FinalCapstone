<?php

namespace App\Services;

use App\Enums\InventoryTransactionType;
use App\Models\Forecast;
use App\Models\Inventory;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

class ForecastService
{
    public function simpleMovingAverage(array $series, int $periods): float
    {
        if ($periods < 1) {
            throw new \InvalidArgumentException('Periods must be at least 1.');
        }

        $values = collect($series)->map(fn ($value) => (float) $value)->take(-$periods);

        if ($values->isEmpty()) {
            return 0.0;
        }

        return round((float) $values->average(), 2);
    }

    public function monthlyDemandSeries(Inventory $inventory, int $periods): Collection
    {
        $end = CarbonImmutable::now()->endOfMonth();
        $start = $end->subMonths($periods - 1)->startOfMonth();

        $transactions = $inventory->transactions()
            ->whereBetween('transaction_date', [$start, $end])
            ->whereIn('type', [
                InventoryTransactionType::Consumption->value,
                InventoryTransactionType::Fulfillment->value,
                InventoryTransactionType::AdjustmentOut->value,
            ])
            ->get(['quantity', 'transaction_date']);

        return collect(range(0, $periods - 1))->map(function (int $offset) use ($start, $transactions): array {
            $month = $start->addMonths($offset);
            $quantity = $transactions
                ->filter(fn ($transaction) => $transaction->transaction_date->format('Y-m') === $month->format('Y-m'))
                ->sum(fn ($transaction) => abs((float) $transaction->quantity));

            return [
                'period' => $month->format('Y-m'),
                'quantity' => round((float) $quantity, 2),
            ];
        });
    }

    public function generate(Inventory $inventory, int $periods, ?User $user): Forecast
    {
        $series = $this->monthlyDemandSeries($inventory, $periods);
        $prediction = $this->simpleMovingAverage($series->pluck('quantity')->all(), $periods);
        $safetyPercent = (float) config('franchise.forecast_safety_stock_percent', 15);
        $targetStock = $prediction * (1 + ($safetyPercent / 100));
        $recommended = max(0, ceil($targetStock - (float) $inventory->current_stock));

        return Forecast::create([
            'inventory_id' => $inventory->id,
            'method' => 'simple_moving_average',
            'period_start' => now()->startOfMonth()->subMonths($periods - 1)->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
            'periods_used' => $periods,
            'predicted_quantity' => $prediction,
            'recommended_reorder_quantity' => $recommended,
            'input_series' => $series->values()->all(),
            'generated_by_user_id' => $user?->id,
            'generated_at' => now(),
        ]);
    }
}
