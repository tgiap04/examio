import type { CookieOptions, Response } from 'express';
import { accessTtlSeconds } from './access-ttl';

/** Browser session lifetime (matches `AuthService.sessionTtlMs`). */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE_PATH = '/api/v1/auth';

export const authCookieNames = {
    access: 'accessToken',
    refresh: 'refreshToken',
    /** Pre-rewrite cookies (set by the old gateway/auth); only ever cleared. */
    legacy: ['token', 'session_id', 'refreshToken'],
} as const;

/**
 * Only auth sets cookies. Host-only (no Domain), HttpOnly, SameSite=Lax, and
 * Secure in production: a top-level OAuth callback navigation still carries
 * them, a cross-site request does not.
 */
function base(path: string, maxAge: number): CookieOptions {
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path,
        maxAge,
    };
}

/** `accessToken`: Path=/, lives as long as the token. */
export function accessTokenCookie(): CookieOptions {
    return base('/', accessTtlSeconds() * 1000);
}

/** `refreshToken`: only sent to `/api/v1/auth/*`, lives as long as the session. */
export function refreshTokenCookie(): CookieOptions {
    return base(REFRESH_COOKIE_PATH, SESSION_TTL_MS);
}

/**
 * Logout: clears the current cookies and every legacy name, including the
 * production `COOKIE_DOMAIN` variants the pre-rewrite code set.
 */
export function clearAuthCookies(res: Pick<Response, 'clearCookie'>): void {
    const { maxAge: _a, ...access } = accessTokenCookie();
    const { maxAge: _r, ...refresh } = refreshTokenCookie();
    res.clearCookie(authCookieNames.access, access);
    res.clearCookie(authCookieNames.refresh, refresh);

    const legacyDomain = process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN || '.kmaedu.fayedark.com' : undefined;
    for (const name of authCookieNames.legacy) {
        res.clearCookie(name, { ...access });
        if (legacyDomain) res.clearCookie(name, { ...access, domain: legacyDomain });
    }
}
