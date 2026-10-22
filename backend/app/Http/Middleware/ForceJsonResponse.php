<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ForceJsonResponse
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->is('api/*')) {
            $request->headers->set('Accept', 'application/json');
        }

        $response = $next($request);
        $response->headers->set('X-Request-Id', $request->headers->get('X-Request-Id', (string) str()->uuid()));

        return $response;
    }
}
