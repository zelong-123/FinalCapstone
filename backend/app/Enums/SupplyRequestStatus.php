<?php

namespace App\Enums;

enum SupplyRequestStatus: string
{
    case Draft = 'draft';
    case Submitted = 'submitted';
    case UnderReview = 'under_review';
    case Endorsed = 'endorsed';
    case Rejected = 'rejected';
    case Preparing = 'preparing';
    case Dispatched = 'dispatched';
    case Delivered = 'delivered';
    case Completed = 'completed';
    case Cancelled = 'cancelled';
}
