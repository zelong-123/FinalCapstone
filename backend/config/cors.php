<?php

$origins = array_values(array_filter(array_map('trim', explode(',', env('CORS_ALLOWED_ORIGINS', env('FRONTEND_URL', 'http://127.0.0.1:5173'))))));

return [
    'paths' => ['api/*', 'up'],
    'allowed_methods' => ['*'],
    'allowed_origins' => $origins,
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => ['X-Request-Id'],
    'max_age' => 600,
    'supports_credentials' => false,
];
