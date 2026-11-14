import * as request from 'supertest';
import {
    AuthApp,
    PASSWORD,
    bootAuthApp,
    loginVerified,
    registerUser,
} from '../helpers/auth-app';

/**
 * Two real users, real Postgres. The titles carry the AUTHENTICATED_ALLOWLIST
 * keys of the device handlers that take a path parameter or list data.
 */
describe('devices ownership (e2e)', () => {
    let ctx: AuthApp;
    let aToken: string;
    let bToken: string;
    let aSessionRowId: string;
    let bSessionRowId: string;

    const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

    beforeAll(async () => {
        ctx = await bootAuthApp();
        const a = await registerUser(ctx);
        const b = await registerUser(ctx);
        aToken = (await loginVerified(ctx, a.email)).body.token;
        bToken = (await loginVerified(ctx, b.email)).body.token;
        // A second, older session for A, so there is something to revoke.
        const aOther = await request(ctx.url)
            .post('/api/v1/auth/login')
            .set('x-device-id', `dev-second-${a.username}`)
            .send({ credential: a.email, password: PASSWORD });
        expect(aOther.status).toBe(201);
        const aRows = await ctx.prisma.userSession.findMany({
            where: { userId: a.id },
        });
        const bRows = await ctx.prisma.userSession.findMany({
            where: { userId: b.id },
        });
        aSessionRowId = aRows[0].id;
        bSessionRowId = bRows[0].id;
        expect(aRows.length).toBeGreaterThan(1);
    });
    afterAll(() => ctx.close());

    it('DevicesController.getDevices user B never sees user A devices', async () => {
        const res = await request(ctx.url)
            .get('/api/v1/devices')
            .set(bearer(bToken));
        expect(res.status).toBe(200);
        const ids = res.body.devices.map((d: { id: string }) => d.id);
        expect(ids).toContain(bSessionRowId);
        expect(ids).not.toContain(aSessionRowId);
    });

    it('DevicesController.logoutDevice user B can not revoke user A session (403) and it stays active', async () => {
        const res = await request(ctx.url)
            .delete(`/api/v1/devices/${aSessionRowId}`)
            .set(bearer(bToken));
        expect(res.status).toBe(403);
        const row = await ctx.prisma.userSession.findUnique({
            where: { id: aSessionRowId },
        });
        expect(row?.isActive).toBe(true);
    });

    it('DevicesController.logoutDevice anonymous -> 401 and an unknown id -> 404', async () => {
        expect(
            (await request(ctx.url).delete(`/api/v1/devices/${aSessionRowId}`))
                .status
        ).toBe(401);
        expect(
            (
                await request(ctx.url)
                    .delete('/api/v1/devices/does-not-exist')
                    .set(bearer(aToken))
            ).status
        ).toBe(404);
    });

    it('DevicesController.logoutAllOthers only revokes the caller own other sessions', async () => {
        const bBefore = await ctx.prisma.userSession.count({
            where: { id: bSessionRowId, isActive: true },
        });
        const res = await request(ctx.url)
            .post('/api/v1/devices/logout-all-others')
            .set(bearer(aToken));
        expect(res.status).toBe(201);
        expect(
            await ctx.prisma.userSession.count({
                where: { id: bSessionRowId, isActive: true },
            })
        ).toBe(bBefore);
    });
});
