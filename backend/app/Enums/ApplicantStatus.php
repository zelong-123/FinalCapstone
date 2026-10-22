<?php

namespace App\Enums;

enum ApplicantStatus: string
{
    case Inquiry = 'inquiry';
    case Qualified = 'qualified';
    case Scheduled = 'scheduled';
    case LoiSubmitted = 'loi_submitted';
    case PaymentSubmitted = 'payment_submitted';
    case ForApproval = 'for_approval';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case ActiveFranchisee = 'active_franchisee';
}
