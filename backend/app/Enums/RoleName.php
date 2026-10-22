<?php

namespace App\Enums;

enum RoleName: string
{
    case Marketing = 'marketing';
    case Sales = 'sales';
    case Admin = 'admin';
    case Logistics = 'logistics';
    case Franchisee = 'franchisee';
}
