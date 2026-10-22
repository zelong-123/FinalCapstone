<?php

use Illuminate\Support\Facades\Route;

Route::get('/', fn () => redirect('/app'));

Route::get('/docs/openapi.yaml', fn () => response()->file(base_path('docs/openapi.yaml')));

$serveMainApp = function () {
    $index = public_path('app/index.html');

    if (! is_file($index)) {
        return response()->json([
            'message' => 'The Herald frontend has not been built yet.',
            'command' => 'Run npm run build from the project root.',
        ], 503);
    }

    return response()->file($index);
};

// Use separate base and catch-all routes. This reliably supports direct links,
// browser refreshes, and nested React pages such as /app/supply-requests.
Route::get('/app', $serveMainApp);
Route::get('/app/{path}', $serveMainApp)->where('path', '.*');

$serveBranchManagement = function () {
    $index = public_path('branch-management/index.html');
    abort_unless(is_file($index), 404, 'The branch management panel has not been installed.');
    return response()->file($index);
};
Route::get('/branch-management', $serveBranchManagement);
Route::get('/branch-management/{path}', $serveBranchManagement)->where('path', '.*');

foreach (range(1, 4) as $branchNumber) {
    $serveBranch = function () use ($branchNumber) {
        $index = public_path("branch-{$branchNumber}/index.html");
        abort_unless(is_file($index), 404, 'The branch portal has not been installed.');
        return response()->file($index);
    };

    Route::get("/branch-{$branchNumber}", $serveBranch);
    Route::get("/branch-{$branchNumber}/{path}", $serveBranch)->where('path', '.*');
}
