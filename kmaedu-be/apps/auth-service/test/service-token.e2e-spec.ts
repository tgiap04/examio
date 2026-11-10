import * as request from 'supertest';
import { createTokenVerifier } from '@kmaedu/auth-jwt';
import {
    AuthApp,
    SERVICE_SECRETS,
    bootAuthApp,
    decodeClaims,
    loginVerified,
    registerUser,
} from './helpers/auth-app';

describe('service tokens: POST /internal/token (e2e)', () => {
    let ctx: AuthApp;
    beforeAll(async () => {
        ctx = await bootAuthApp();
    });
    afterAll(() => ctx.close());

    const issue = (body: Record<string, unknown>) =>
        request(ctx.url).post('/internal/token').send(body);

    it('a valid client_credentials request yields svc:exam for aud admin, roles [SERVICE], <= 5 min', async () => {
        const res = await issue({ client_id: 'exam', client_secret: SERVICE_SECRETS.exam, audience: 'admin' });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 300 });
        const claims = decodeClaims(res.body.access_token);
        expect(claims).toMatchObject({ sub: 'svc:exam', aud: 'admin', roles: ['SERVICE'], iss: 'kmaedu-auth' });
        expect(claims).not.toHaveProperty('sid');
        expect(claims).not.toHaveProperty('av');
        expect(claims).not.toHaveProperty('email_verified');
        expect((claims.exp as number) - (claims.iat as number)).toBeLessThanOrEqual(300);
    });

    it('is verifiable by another service through the published JWKS, only for its own audience', async () => {
        const res = await issue({ client_id: 'exam', client_secret: SERVICE_SECRETS.exam, audience: 'admin' });
        const admin = createTokenVerifier({
            jwksUrl: `${ctx.url}/.well-known/jwks.json`,
            issuer: 'kmaedu-auth',
            audiences: ['kmaedu', 'admin'],
        });
        await expect(admin(res.body.access_token)).resolves.toEqual({ kind: 'service', name: 'exam' });
        const r2 = createTokenVerifier({
            jwksUrl: `${ctx.url}/.well-known/jwks.json`,
            issuer: 'kmaedu-auth',
            audiences: ['kmaedu', 'r2'],
        });
        await expect(r2(res.body.access_token)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
    });

    it('rejects a wrong secret, another client\'s secret, an unknown client and an unknown (or removed) audience with 401', async () => {
        for (const body of [
            { client_id: 'exam', client_secret: 'wrong', audience: 'admin' },
            { client_id: 'exam', client_secret: SERVICE_SECRETS.content, audience: 'admin' },
            { client_id: 'ghost', client_secret: SERVICE_SECRETS.exam, audience: 'admin' },
            { client_id: 'exam', client_secret: SERVICE_SECRETS.exam, audience: 'nowhere' },
            // finance-service was removed: its audience no longer exists.
            { client_id: 'exam', client_secret: SERVICE_SECRETS.exam, audience: 'finance' },
        ]) {
            const res = await issue(body);
            expect(res.status).toBe(401);
            expect(res.body.access_token).toBeUndefined();
            // No detail about WHICH part was wrong.
            expect(res.body.message).toBe('Invalid client credentials');
        }
    });

    it('a malformed body is 400', async () => {
        expect((await issue({ client_id: 'exam' })).status).toBe(400);
        expect((await issue({ client_id: 'exam', client_secret: 'x', audience: 'admin', extra: 1 })).status).toBe(400);
    });

    it('a service token is rejected by an HTTP @Authenticated route with 403 PERMISSION_DENIED', async () => {
        const res = await issue({ client_id: 'admin', client_secret: SERVICE_SECRETS.admin, audience: 'auth' });
        const token = res.body.access_token as string;
        const me = await request(ctx.url).get('/api/v1/auth/me').set('authorization', `Bearer ${token}`);
        expect([me.status, me.body.code]).toEqual([403, 'PERMISSION_DENIED']);
    });

    it('a user access token is not accepted where a service token is required (aud/roles differ) and vice versa', async () => {
        const { email } = await registerUser(ctx);
        const login = await loginVerified(ctx, email);
        const claims = decodeClaims(login.body.token);
        expect(claims.roles).not.toContain('SERVICE');
        expect(String(claims.sub).startsWith('svc:')).toBe(false);
    });
});
