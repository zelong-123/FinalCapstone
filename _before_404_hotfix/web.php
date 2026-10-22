<?php

use Illuminate\Support\Facades\Route;

Route::get('/', fn () => redirect('/app'));

Route::get('/docs/openapi.yaml', fn () => response()->file(base_path('docs/openapi.yaml')));

Route::get('/app/{path?}', function () {
    $index = public_path('app/index.html');

    if (! is_file($index)) {
        return response()->json([
            'message' => 'The Herald frontend has not been built yet.',
            'command' => 'Run npm run build from the project root.',
        ], 503);
    }

    return response()->file($index);
})->where('path', '.*');


Route::get('/branch-management/{path?}', function () {
    $index = public_path('branch-management/index.html');

    abort_unless(is_file($index), 404, 'The branch management panel has not been installed.');

    return response()->file($index);
})->where('path', '.*');


foreach (range(1, 4) as $branchNumber) {
    Route::get("/branch-{$branchNumber}/{path?}", function () use ($branchNumber) {
        $index = public_path("branch-{$branchNumber}/index.html");

        abort_unless(is_file($index), 404, 'The branch portal has not been installed.');

        return response()->file($index);
    })->where('path', '.*');
}
