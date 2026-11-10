import { accessTokenCookie, authCookieNames, clearAuthCookies, refreshTokenCookie } from './cookie-config';

const prod = (value: boolean) => {
    process.env.NODE_ENV = value ? 'production' : 'test';
};
afterEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.COOKIE_DOMAIN;
});

describe('auth cookies (only auth sets them, Lax, host-only)', () => {
    it('accessToken: Path=/, 15 minutes, HttpOnly, SameSite=Lax, no Domain', () => {
        prod(false);
        expect(accessTokenCookie()).toEqual({
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
            path: '/',
            maxAge: 900_000,
        });
    });

    it('refreshToken: scoped to /api/v1/auth for the 30 day session', () => {
        prod(false);
        expect(refreshTokenCookie()).toEqual({
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
            path: '/api/v1/auth',
            maxAge: 30 * 24 * 3600 * 1000,
        });
    });

    it('Secure only in production; never a Domain attribute, even when COOKIE_DOMAIN is set', () => {
        prod(true);
        process.env.COOKIE_DOMAIN = '.kmaedu.fayedark.com';
        for (const options of [accessTokenCookie(), refreshTokenCookie()]) {
            expect(options.secure).toBe(true);
            expect(options.sameSite).toBe('lax');
            expect(options).not.toHaveProperty('domain');
        }
    });

    it('accessTtlSeconds follows ACCESS_TOKEN_EXPIRATION', () => {
        process.env.ACCESS_TOKEN_EXPIRATION = '30m';
        expect(accessTokenCookie().maxAge).toBe(1_800_000);
        delete process.env.ACCESS_TOKEN_EXPIRATION;
    });

    it('clearAuthCookies clears the current cookies and every legacy name/path/domain', () => {
        prod(true);
        process.env.COOKIE_DOMAIN = '.kmaedu.fayedark.com';
        const cleared: Array<[string, Record<string, unknown>]> = [];
        clearAuthCookies({ clearCookie: (n: string, o: Record<string, unknown>) => void cleared.push([n, o]) } as never);
        const key = (n: string, path: string, domain?: string) =>
            cleared.some(([name, o]) => name === n && o.path === path && o.domain === domain);
        expect(key('accessToken', '/')).toBe(true);
        expect(key('refreshToken', '/api/v1/auth')).toBe(true);
        // legacy: gateway-era cookies (Path=/, production domain) and host-only variants
        for (const legacy of authCookieNames.legacy) {
            expect(key(legacy, '/')).toBe(true);
            expect(key(legacy, '/', '.kmaedu.fayedark.com')).toBe(true);
        }
        expect(key('refreshToken', '/', '.kmaedu.fayedark.com')).toBe(true);
    });
});
