import * as request from 'supertest';
import { AuthApp, PASSWORD, bootAuthApp, registerUser } from './helpers/auth-app';

describe('POST /auth/refresh cookie rotation (e2e, real Postgres)', () => {
    let ctx: AuthApp;

    beforeAll(async () => {
        ctx = await bootAuthApp();
    });
    afterAll(() => ctx.close());

    const cookieValue = (res: request.Response, name: string): string | undefined => {
        const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
        return raw.find((c) => c.startsWith(`${name}=`))?.split(';')[0].slice(name.length + 1);
    };

    it('rotates the httpOnly refreshToken cookie, so a later refresh still works after the grace window', async () => {
        const { email, id } = await registerUser(ctx);
        await ctx.prisma.user.update({ where: { email }, data: { isVerified: true } });
        // The agent keeps a cookie jar, exactly like the browser does.
        const agent = request.agent(ctx.url);
        const loginRes = await agent
            .post('/api/v1/auth/login')
            .set('x-device-id', 'dev-refresh-cookie')
            .send({ credential: email, password: PASSWORD });
        expect(loginRes.status).toBe(201);
        const firstRefreshCookie = cookieValue(loginRes, 'refreshToken');
        expect(firstRefreshCookie).toBeTruthy();

        const first = await agent.post('/api/v1/auth/refresh').set('x-device-id', 'dev-refresh-cookie');
        expect(first.status).toBe(201);
        // The rotated token must come back as a cookie, not only in the JSON body.
        const rotated = cookieValue(first, 'refreshToken');
        expect(rotated).toBeTruthy();
        expect(rotated).not.toBe(firstRefreshCookie);
        expect(cookieValue(first, 'accessToken')).toBeTruthy();
        expect(first.body.refreshToken).toBeTruthy();

        // Fast-forward past REFRESH_GRACE_MS: the previous token is no longer accepted.
        await ctx.prisma.userSession.updateMany({
            where: { userId: id, previousRefreshToken: { not: null } },
            data: { previousTokenExpiresAt: new Date(Date.now() - 1000) },
        });

        const second = await agent.post('/api/v1/auth/refresh').set('x-device-id', 'dev-refresh-cookie');
        expect(second.status).toBe(201);
        expect(cookieValue(second, 'refreshToken')).toBeTruthy();
    });
});
