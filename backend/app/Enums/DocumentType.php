<?php

namespace App\Enums;

enum DocumentType: string
{
    case Loi = 'loi';
    case PaymentReceipt = 'payment_receipt';
    case Pod = 'proof_of_delivery';
    case AcknowledgementReceipt = 'acknowledgement_receipt';
    case Other = 'other';
}
