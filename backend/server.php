<?php

/**
 * PHP Built-in server router for Herald.
 *
 * Serves SPA index.html for catch-all routes, static assets as-is,
 * and delegates everything else to Laravel.
 */

$uri = urldecode(
    parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? ''
);

$publicPath = __DIR__ . '/public';

// --- SPA catch-all routes ---------------------------------------------------
// For any path under /app/, /branch-management, or /branch-N, serve the
// corresponding index.html so React Router handles client-side routing.
$spaRoutes = [
    '/app'                      => 'app/index.html',
    '/branch-management'        => 'branch-management/index.html',
    '/branch-1'                 => 'branch-1/index.html',
    '/branch-2'                 => 'branch-2/index.html',
    '/branch-3'                 => 'branch-3/index.html',
    '/branch-4'                 => 'branch-4/index.html',
];

foreach ($spaRoutes as $prefix => $file) {
    if ($uri === $prefix || str_starts_with($uri, $prefix . '/')) {
        $path = $publicPath . '/' . $file;
        if (is_file($path)) {
            // Return false so the built-in server sends the file at the exact URI.
            // For /app itself the server finds public/app/index.html.
            // For /app/sub the server won't find a file, so we must serve it.
            if (is_file($publicPath . $uri)) {
                return false;
            }
            // Serve the SPA entry point ourselves.
            header('Content-Type: text/html; charset=utf-8');
            readfile($path);
            return;
        }
    }
}

// --- Static assets (CSS, JS, images, branch-assets, etc.) ------------------
if ($uri !== '/' && is_file($publicPath . $uri)) {
    return false;
}

// --- Everything else → Laravel -----------------------------------------------
require_once $publicPath . '/index.php';
