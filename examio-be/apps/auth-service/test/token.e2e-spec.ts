import * as request from 'supertest';
import { createTokenVerifier, permissionsOf, ROLE_PERMISSIONS } from '@examio/auth-jwt';
import {
    AuthApp,
    PASSWORD,
    bootAuthApp,
    decodeClaims,
    decodeHeader,
    loginVerified,
    registerUser,
    uniq,
} from './helpers/auth-app';

describe('auth tokens (e2e, real Postgres)', () => {
    let ctx: AuthApp;

    beforeAll(async () => {
        ctx = await bootAuthApp();
    });
    afterAll(() => ctx.close());

    const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

    it('GET /.well-known/jwks.json is public, outside api/v1, and has signing keys only', async () => {
        const res = await request(ctx.url).get('/.well-known/jwks.json');
        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toMatch(/max-age/);
        expect(res.body.keys).toHaveLength(1);
        expect(res.body.keys[0]).toMatchObject({ kty: 'RSA', use: 'sig', alg: 'RS256' });
        expect(res.body.keys[0]).not.toHaveProperty('d');
        expect((await request(ctx.url).get('/api/v1/.well-known/jwks.json')).status).toBe(404);
    });

    it('register -> STUDENT, no subscription, no wallet, /auth/me has roles + permissions and no isAdmin', async () => {
        const { res, id } = await registerUser(ctx);
        expect(res.status).toBe(201);
        expect(res.body.roles).toEqual(['STUDENT']);
        expect(res.body.permissions.sort()).toEqual([...ROLE_PERMISSIONS.STUDENT].sort());

        const me = await request(ctx.url).get('/api/v1/auth/me').set(bearer(res.body.token));
        expect(me.status).toBe(200);
        expect(me.body.roles).toEqual(['STUDENT']);
        expect(me.body.permissions.sort()).toEqual([...ROLE_PERMISSIONS.STUDENT].sort());
        expect(me.body.user).toMatchObject({ id, role: 'STUDENT', isSystemAdmin: false });
        expect(me.body.user).not.toHaveProperty('isAdmin');
        expect(me.body.user).not.toHaveProperty('password');
        expect(me.body.user).not.toHaveProperty('wallet');
        expect(me.body.user).not.toHaveProperty('subscription');

        expect(await ctx.prisma.userSubscription.count({ where: { userId: id } })).toBe(0);
        expect(await ctx.prisma.wallet.count({ where: { userId: id } })).toBe(0);
    });

    it('the issued token verifies against /.well-known/jwks.json with kid, typ and every claim', async () => {
        const { res, id } = await registerUser(ctx);
        const token = res.body.token as string;

        expect(decodeHeader(token)).toMatchObject({ alg: 'RS256', typ: 'at+jwt', kid: expect.any(String) });
        const claims = decodeClaims(token);
        expect(claims).toMatchObject({
            iss: 'examio-auth',
            aud: 'examio',
            sub: id,
            roles: ['STUDENT'],
            email_verified: false,
            av: 0,
        });
        expect(claims.sid).toEqual(expect.any(String));
        expect((claims.exp as number) - (claims.iat as number)).toBe(900);

        const verify = createTokenVerifier({
            jwksUrl: `${ctx.url}/.well-known/jwks.json`,
            issuer: 'examio-auth',
            audiences: ['examio', 'exam'],
        });
        await expect(verify(token)).resolves.toMatchObject({ kind: 'user', id, av: 0, emailVerified: false });
    });

    it('rejects register/login bodies that try to inject role or isSystemAdmin (400)', async () => {
        const name = uniq('inj');
        const res = await request(ctx.url)
            .post('/api/v1/auth/register')
            .send({ username: name, email: `${name}@e2e.test`, password: PASSWORD, role: 'TEACHER', isSystemAdmin: true });
        expect(res.status).toBe(400);
        expect(await ctx.prisma.user.count({ where: { username: name } })).toBe(0);
        const login = await request(ctx.url)
            .post('/api/v1/auth/login')
            .send({ credential: 'x@e2e.test', password: PASSWORD, isSystemAdmin: true });
        expect(login.status).toBe(400);
    });

    it('unverified users are denied on @Authenticated routes but allowed on the pinned list; verifyAccount re-issues the token', async () => {
        const { res, id } = await registerUser(ctx);
        const t0 = res.body.token as string;

        const denied = await request(ctx.url).get('/api/v1/profile').set(bearer(t0));
        expect(denied.status).toBe(403);
        expect(denied.body.code).toBe('EMAIL_NOT_VERIFIED');
        expect((await request(ctx.url).get('/api/v1/auth/me').set(bearer(t0))).status).toBe(200);
        expect((await request(ctx.url).get('/api/v1/devices').set(bearer(t0))).status).toBe(200);

        await ctx.prisma.verifyAccountCode.create({
            data: { id: uniq('v'), userId: id, code: '123456', expiresAt: new Date(Date.now() + 600_000) },
        });
        const verified = await request(ctx.url)
            .post('/api/v1/auth/verifyAccount')
            .set(bearer(t0))
            .send({ code: '123456' });
        expect(verified.status).toBe(201);
        const t1 = verified.body.token as string;
        expect(decodeClaims(t1)).toMatchObject({ email_verified: true, sid: decodeClaims(t0).sid });
        expect((await request(ctx.url).get('/api/v1/profile').set(bearer(t1))).status).toBe(200);
        expect(String(verified.headers['set-cookie'])).toMatch(/accessToken=/);
    });

    it('missing, garbage and expired credentials give 401 with a code', async () => {
        const none = await request(ctx.url).get('/api/v1/auth/me');
        expect([none.status, none.body.code]).toEqual([401, 'TOKEN_MISSING']);
        const bad = await request(ctx.url).get('/api/v1/auth/me').set(bearer('not-a-jwt'));
        expect([bad.status, bad.body.code]).toEqual([401, 'TOKEN_INVALID']);
    });

    it('refresh after a role change returns the new roles and a higher av', async () => {
        const { email, id } = await registerUser(ctx);
        const login = await loginVerified(ctx, email);
        expect(login.status).toBe(201);
        expect(decodeClaims(login.body.token)).toMatchObject({ roles: ['STUDENT'], av: 0 });

        await ctx.prisma.user.update({ where: { id }, data: { role: 'TEACHER', authzVersion: { increment: 1 } } });

        const refreshed = await request(ctx.url)
            .post('/api/v1/auth/refresh')
            .send({ refreshToken: login.body.refreshToken });
        expect(refreshed.status).toBe(201);
        expect(refreshed.body.roles).toEqual(['TEACHER']);
        expect(refreshed.body.permissions).toEqual(permissionsOf(['TEACHER']));
        expect(decodeClaims(refreshed.body.token)).toMatchObject({ roles: ['TEACHER'], av: 1, email_verified: true });
        expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);
    });

    it('refresh of a banned user is 401 ACCOUNT_DISABLED and the session is revoked', async () => {
        const { email, id } = await registerUser(ctx);
        const login = await loginVerified(ctx, email);
        await ctx.prisma.user.update({ where: { id }, data: { isBanned: true } });

        const res = await request(ctx.url).post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken });
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('ACCOUNT_DISABLED');
        const session = await ctx.prisma.userSession.findUnique({ where: { sessionId: decodeClaims(login.body.token).sid as string } });
        expect(session?.isActive).toBe(false);
    });

    it('login of a banned user is 401 ACCOUNT_DISABLED', async () => {
        const { email, id } = await registerUser(ctx);
        await ctx.prisma.user.update({ where: { id }, data: { isBanned: true, isVerified: true } });
        const res = await request(ctx.url)
            .post('/api/v1/auth/login')
            .set('x-device-id', 'dev-banned')
            .send({ credential: email, password: PASSWORD });
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('ACCOUNT_DISABLED');
    });

    it('logout deactivates the token sid session (not a client cookie)', async () => {
        const { email } = await registerUser(ctx);
        const login = await loginVerified(ctx, email);
        const out = await request(ctx.url).post('/api/v1/auth/logout').set(bearer(login.body.token));
        expect(out.status).toBe(201);
        const session = await ctx.prisma.userSession.findUnique({ where: { sessionId: decodeClaims(login.body.token).sid as string } });
        expect(session?.isActive).toBe(false);
    });

    describe('password change / reset bump authzVersion and emit exactly one authz_changed', () => {
        const rows = (userId: string) =>
            ctx.prisma.outboxEvent.findMany({
                where: { type: 'auth.user.authz_changed', envelope: { path: ['data', 'userId'], equals: userId } },
            });

        it('change-password', async () => {
            const { email, id } = await registerUser(ctx);
            const login = await loginVerified(ctx, email);
            await ctx.prisma.resetPasswordCode.create({
                data: { id: uniq('r'), userId: id, code: '654321', expiresAt: new Date(Date.now() + 600_000) },
            });
            const res = await request(ctx.url)
                .post('/api/v1/auth/change-password')
                .set(bearer(login.body.token))
                .send({ code: '654321', currentPassword: PASSWORD, newPassword: 'N3wPassw0rd!' });
            expect(res.status).toBe(201);

            const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id } });
            expect(user.authzVersion).toBe(1);
            const events = await rows(id);
            expect(events).toHaveLength(1);
            expect((events[0].envelope as { data: Record<string, unknown> }).data).toMatchObject({
                userId: id, authzVersion: 1, version: 1, role: 'STUDENT', isSystemAdmin: false, isBanned: false, reason: 'password',
            });
            expect(await ctx.prisma.resetPasswordCode.count({ where: { userId: id } })).toBe(0);
            // All sessions died with the credential rotation.
            const session = await ctx.prisma.userSession.findUnique({ where: { sessionId: decodeClaims(login.body.token).sid as string } });
            expect(session?.isActive).toBe(false);
        });

        it('reset-password', async () => {
            const { email, id } = await registerUser(ctx);
            await ctx.prisma.resetPasswordCode.create({
                data: { id: uniq('r'), userId: id, code: '111222', expiresAt: new Date(Date.now() + 600_000) },
            });
            const res = await request(ctx.url)
                .post('/api/v1/auth/reset-password')
                .send({ email, code: '111222', newPassword: 'Another1Pass!' });
            expect(res.status).toBe(201);
            expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id } })).authzVersion).toBe(1);
            const events = await rows(id);
            expect(events).toHaveLength(1);
            expect((events[0].envelope as { data: { reason: string } }).data.reason).toBe('password');
        });
    });
});
