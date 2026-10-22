<?php

namespace App\Enums;

enum InquiryStatus: string
{
    case New = 'new';
    case Contacted = 'contacted';
    case Endorsed = 'endorsed';
    case Converted = 'converted';
    case Closed = 'closed';
}
