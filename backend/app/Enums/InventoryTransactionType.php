<?php

namespace App\Enums;

enum InventoryTransactionType: string
{
    case Opening = 'opening';
    case AdjustmentIn = 'adjustment_in';
    case AdjustmentOut = 'adjustment_out';
    case Consumption = 'consumption';
    case Fulfillment = 'fulfillment';
    case Replenishment = 'replenishment';
}
