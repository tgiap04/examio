import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthStrictThrottlerGuard } from './auth-strict-throttler.guard';

export const STRICT_THROTTLE_KEY = 'auth:strict-throttle';
export const STRICT_LIMIT = 5;
export const STRICT_TTL_MS = 60_000;

/**
 * Brute-force limit for credential endpoints (login, register, code/password
 * flows): 5 attempts per 60 s per client IP, the same budget as the gateway's
 * bucket, kept here as defense in depth. The marker makes the global throttler
 * skip the handler, so each request is counted exactly once (both guards share
 * the storage key and would otherwise double count: a 3rd attempt would fail).
 */
export const StrictThrottle = () =>
    applyDecorators(
        SetMetadata(STRICT_THROTTLE_KEY, true),
        UseGuards(AuthStrictThrottlerGuard),
        Throttle({ default: { limit: STRICT_LIMIT, ttl: STRICT_TTL_MS } })
    );
