import * as request from 'supertest';
import { AuthApp, PASSWORD, bootAuthApp, loginVerified, registerUser } from './helpers/auth-app';

const FORBIDDEN_USER_KEYS = ['wallet', 'subscription', 'isAdmin', 'password'];

function expectShape(body: Record<string, unknown>) {
    const user = body.user as Record<string, unknown>;
    expect(Array.isArray(body.roles)).toBe(true);
    expect(Array.isArray(body.permissions)).toBe(true);
    for (const key of FORBIDDEN_USER_KEYS) expect(user).not.toHaveProperty(key);
}

describe('/auth/me, login, refresh response shape (e2e)', () => {
    let ctx: AuthApp;

    beforeAll(async () => {
        ctx = await bootAuthApp();
    });
    afterAll(() => ctx.close());

    const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

    it.each(['STUDENT', 'TEACHER'] as const)(
        '%s: register, login, refresh and /auth/me return { user, roles, permissions } with no wallet/subscription/isAdmin',
        async (role) => {
            const { res: registered, id, email } = await registerUser(ctx);
            expectShape(registered.body);
            await ctx.prisma.user.update({ where: { id }, data: { role } });

            const login = await loginVerified(ctx, email);
            expect(login.status).toBe(201);
            expectShape(login.body);

            const me = await request(ctx.url).get('/api/v1/auth/me').set(bearer(login.body.token));
            expect(me.status).toBe(200);
            expectShape(me.body);
            expect(me.body.roles).toEqual([role]);
            expect(me.body.user).toMatchObject({ id, role, isSystemAdmin: false });

            const refreshed = await request(ctx.url)
                .post('/api/v1/auth/refresh')
                .set('Cookie', login.headers['set-cookie'] as unknown as string[])
                .set('x-device-id', `dev-login-${email}`)
                .send({});
            expect(refreshed.status).toBe(201);
            expectShape(refreshed.body);
        }
    );

    it('login with credentials still works (password never echoed)', async () => {
        const { email } = await registerUser(ctx);
        const login = await request(ctx.url)
            .post('/api/v1/auth/login')
            .set('x-device-id', 'dev-x')
            .send({ credential: email, password: PASSWORD });
        expect(login.status).toBe(201);
        expect(JSON.stringify(login.body)).not.toContain(PASSWORD);
    });
});
