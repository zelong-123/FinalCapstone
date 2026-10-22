<?php

use App\Http\Controllers\Api\V1\ActivityController;
use App\Http\Controllers\Api\V1\AnalyticsController;
use App\Http\Controllers\Api\V1\ApplicantController;
use App\Http\Controllers\Api\V1\AuditLogController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BrandController;
use App\Http\Controllers\Api\V1\BranchManagementController;
use App\Http\Controllers\Api\V1\BranchPortalController;
use App\Http\Controllers\Api\V1\ForecastController;
use App\Http\Controllers\Api\V1\InquiryController;
use App\Http\Controllers\Api\V1\InventoryController;
use App\Http\Controllers\Api\V1\LocationController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\SupplyRequestController;
use App\Http\Controllers\Api\V1\SystemController;
use App\Http\Controllers\Api\V1\UserController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::get('health', [SystemController::class, 'health'])->middleware('throttle:30,1');
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

    Route::middleware(['auth.api', 'throttle:120,1'])->group(function (): void {
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::get('sync-status', [SystemController::class, 'syncStatus']);
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::put('auth/password', [AuthController::class, 'changePassword']);

        Route::get('notifications', [NotificationController::class, 'index']);
        Route::patch('notifications/read-all', [NotificationController::class, 'markAllRead']);
        Route::patch('notifications/{notification}/read', [NotificationController::class, 'markRead']);

        Route::get('brands', [BrandController::class, 'index']);
        Route::get('products', [ProductController::class, 'index']);
        Route::get('locations', [LocationController::class, 'index']);

        Route::middleware('role:franchisee,admin')->prefix('branch')->group(function (): void {
            Route::get('context', [BranchPortalController::class, 'context']);
            Route::get('inventory', [BranchPortalController::class, 'inventory']);
            Route::get('sales', [BranchPortalController::class, 'recentSales']);
            Route::post('sales', [BranchPortalController::class, 'recordSale'])->middleware('throttle:60,1');
        });

        Route::middleware('role:admin,logistics')->get('branches/overview', [BranchManagementController::class, 'index']);

        Route::middleware('role:admin')->group(function (): void {
            Route::apiResource('users', UserController::class);
            Route::get('audit-logs', [AuditLogController::class, 'index']);

            Route::post('brands', [BrandController::class, 'store']);
            Route::put('brands/{brand}', [BrandController::class, 'update']);
            Route::delete('brands/{brand}', [BrandController::class, 'destroy']);

            Route::post('products', [ProductController::class, 'store']);
            Route::put('products/{product}', [ProductController::class, 'update']);
            Route::delete('products/{product}', [ProductController::class, 'destroy']);

            Route::post('locations', [LocationController::class, 'store']);
            Route::put('locations/{location}', [LocationController::class, 'update']);
        });

        Route::middleware('role:marketing,admin,sales')->group(function (): void {
            Route::get('inquiries', [InquiryController::class, 'index']);
            Route::get('inquiries/{inquiry}', [InquiryController::class, 'show']);
        });
        Route::middleware('role:marketing,admin')->group(function (): void {
            Route::post('inquiries', [InquiryController::class, 'store']);
            Route::put('inquiries/{inquiry}', [InquiryController::class, 'update']);
            Route::post('inquiries/{inquiry}/endorse', [InquiryController::class, 'endorse']);
        });
        Route::middleware('role:admin,sales')->post('inquiries/{inquiry}/convert', [InquiryController::class, 'convert']);

        Route::middleware('role:admin,sales,franchisee')->group(function (): void {
            Route::get('applicants', [ApplicantController::class, 'index']);
            Route::get('applicants/{applicant}', [ApplicantController::class, 'show']);
            Route::post('applicants/{applicant}/loi', [ApplicantController::class, 'submitLoi']);
            Route::post('applicants/{applicant}/payments', [ApplicantController::class, 'recordPayment']);
            Route::get('applicants/{applicant}/documents/{document}/download', [ApplicantController::class, 'downloadDocument']);
            Route::get('applicants/{applicant}/payments/{payment}/documents/{document}/download', [ApplicantController::class, 'downloadPaymentDocument']);
        });
        Route::middleware('role:admin,sales')->group(function (): void {
            Route::post('applicants', [ApplicantController::class, 'store']);
            Route::put('applicants/{applicant}', [ApplicantController::class, 'update']);
            Route::patch('applicants/{applicant}/status', [ApplicantController::class, 'updateStatus']);
            Route::post('applicants/{applicant}/portal-user', [ApplicantController::class, 'createPortalUser']);
        });
        Route::middleware('role:admin')->group(function (): void {
            Route::patch('applicants/{applicant}/payments/{payment}/verify', [ApplicantController::class, 'verifyPayment']);
            Route::post('applicants/{applicant}/approve', [ApplicantController::class, 'approve']);
        });

        Route::middleware('role:admin,sales,franchisee')->group(function (): void {
            Route::get('activities', [ActivityController::class, 'index']);
            Route::get('activities/{activity}', [ActivityController::class, 'show']);
        });
        Route::middleware('role:admin,sales')->group(function (): void {
            Route::post('activities', [ActivityController::class, 'store']);
            Route::put('activities/{activity}', [ActivityController::class, 'update']);
            Route::post('activities/{activity}/complete', [ActivityController::class, 'complete']);
            Route::delete('activities/{activity}', [ActivityController::class, 'destroy']);
        });

        Route::middleware('role:admin,logistics,franchisee')->group(function (): void {
            Route::get('inventories', [InventoryController::class, 'index']);
            Route::get('inventories/{inventory}', [InventoryController::class, 'show']);
            Route::post('inventories/{inventory}/adjust', [InventoryController::class, 'adjust']);
            Route::get('inventory-transactions', [InventoryController::class, 'transactions']);
        });
        Route::middleware('role:admin,logistics')->group(function (): void {
            Route::post('inventories', [InventoryController::class, 'store']);
            Route::patch('inventories/{inventory}/thresholds', [InventoryController::class, 'updateThresholds']);
        });

        Route::middleware('role:admin,sales,logistics,franchisee')->group(function (): void {
            Route::get('supply-requests', [SupplyRequestController::class, 'index']);
            Route::get('supply-requests/{supplyRequest}', [SupplyRequestController::class, 'show']);
            Route::get('supply-requests/{supplyRequest}/availability', [SupplyRequestController::class, 'availability']);
            Route::patch('supply-requests/{supplyRequest}/status', [SupplyRequestController::class, 'transition']);
            Route::get('supply-requests/{supplyRequest}/documents/{document}/download', [SupplyRequestController::class, 'downloadDocument']);
        });
        Route::middleware('role:franchisee,admin')->group(function (): void {
            Route::post('supply-requests', [SupplyRequestController::class, 'store']);
            Route::put('supply-requests/{supplyRequest}', [SupplyRequestController::class, 'updateDraft']);
            Route::post('supply-requests/{supplyRequest}/acknowledge', [SupplyRequestController::class, 'acknowledge']);
        });
        Route::middleware('role:logistics')->post('supply-requests/{supplyRequest}/pod', [SupplyRequestController::class, 'uploadPod']);

        Route::middleware('role:admin,marketing,sales,logistics')->group(function (): void {
            Route::get('analytics/overview', [AnalyticsController::class, 'overview']);
            Route::get('analytics/top-locations', [AnalyticsController::class, 'topLocations']);
            Route::get('analytics/inventory-movement', [AnalyticsController::class, 'inventoryMovement']);
        });
        Route::middleware('role:admin,logistics')->group(function (): void {
            Route::get('forecasts', [ForecastController::class, 'index']);
            Route::post('inventories/{inventory}/forecast', [ForecastController::class, 'generate']);
            Route::post('forecasts/generate', [ForecastController::class, 'bulkGenerate']);
        });
    });
});
