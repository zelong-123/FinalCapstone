<?php

namespace App\Http\Middleware;

use App\Models\ApiToken;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateApiToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $plainToken = $request->bearerToken();

        if (! $plainToken) {
            return response()->json(['message' => 'Authentication token is required.'], 401);
        }

        $token = ApiToken::query()
            ->with('user.role')
            ->where('token_hash', hash('sha256', $plainToken))
            ->first();

        if (! $token || $token->isExpired() || ! $token->user || $token->user->account_status !== 'active') {
            return response()->json(['message' => 'The authentication token is invalid or expired.'], 401);
        }

        Auth::setUser($token->user);
        $request->setUserResolver(fn () => $token->user);
        $request->attributes->set('api_token', $token);

        if ($token->last_used_at === null || $token->last_used_at->lt(now()->subMinutes(5))) {
            $token->forceFill(['last_used_at' => now()])->save();
        }

        return $next($request);
    }
}
