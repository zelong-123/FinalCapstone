<?php

namespace Tests\Unit;

use App\Services\ForecastService;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class ForecastServiceTest extends TestCase
{
    public function test_simple_moving_average_uses_the_latest_periods(): void
    {
        $service = new ForecastService();

        $this->assertSame(40.0, $service->simpleMovingAverage([10, 20, 30, 40, 50], 3));
        $this->assertSame(0.0, $service->simpleMovingAverage([], 3));
    }

    public function test_periods_must_be_positive(): void
    {
        $this->expectException(InvalidArgumentException::class);
        (new ForecastService())->simpleMovingAverage([1, 2, 3], 0);
    }
}
