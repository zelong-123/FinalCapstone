<?php

return [
    'api_token_ttl_minutes' => (int) env('API_TOKEN_TTL_MINUTES', 1440),
    'max_upload_kb' => (int) env('MAX_UPLOAD_KB', 10240),
    'forecast_default_periods' => (int) env('FORECAST_DEFAULT_PERIODS', 3),
    'forecast_safety_stock_percent' => (float) env('FORECAST_SAFETY_STOCK_PERCENT', 15),
    'backup_disk' => env('BACKUP_DISK', 'local'),
    'backup_retention_days' => (int) env('BACKUP_RETENTION_DAYS', 14),
    'mysqldump_binary' => env('MYSQLDUMP_BINARY', 'mysqldump'),

    /*
     | Applicant milestone checklist. These keys are stored on applicants.milestones
     | as a key => boolean map and drive the applicant update form and the progress
     | indicator shown on the pipeline table.
     */
    'milestones' => [
        'account_record_set_up' => 'Account record set up',
        'documents_completed' => 'Document requirements completed',
        'orientation_attended' => 'Orientation attended',
        'product_tasting_attended' => 'Product tasting attended',
        'training_completed' => 'Training completed',
        'site_location_confirmed' => 'Site location confirmed',
        'business_plan_approved' => 'Business plan approved',
    ],
];
