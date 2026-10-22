<?php

namespace App\Enums;

enum ActivityType: string
{
    case Orientation = 'orientation';
    case ProductTasting = 'product_tasting';
    case Training = 'training';
    case Other = 'other';
}
