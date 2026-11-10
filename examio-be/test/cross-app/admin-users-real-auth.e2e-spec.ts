import { Harness, bearer, bootHarness, makeUser, onlyAdmins } from './helpers/real-auth-admin';
import { RedisService } from '@examio/redis';
import { FinanceClient } from '../../apps/admin-service/src/clients/finance.client';
import { GatewayClient } from '../../apps/admin-service/src/clients/gateway.client';

/**
 * admin users / stats / page flags against the REAL auth-service (HTTP + gRPC,
 * real guards, real Postgres). finance and the gateway are the only fakes:
 * their servers are not booted in this harness (finance has its own contract specs).
 */
describe('admin over real auth gRPC (phase 10 e2e)', () => {
    let h: Harness;
    const finance = {
        getUserFinance: jest.fn(async (..._a: unknown[]) => ({ wallet: { id: 'w1', balance: 12 }, subscription: { id: 's1', tier: 1, billingCycle: 'monthly', isActive: true } })),
        getRevenueStats: jest.fn(async (..._a: unknown[]) => ({ proUsers: 3, vipUsers: 1, revenueLast30d: '12345', revenueSeries: [] })),
    };
    const gateway = { setPageFlags: jest.fn(async (..._a: unknown[]) => undefined) };

    beforeAll(async () => {
        h = await bootHarness({ providers: [[FinanceClient, finance], [GatewayClient, gateway]] });
    });
    afterAll(() => h.close());

    const get = (path: string, token: string) => h.http().get(path).set(bearer(token));
    const makeAdmin = async () => {
        const a = await makeUser(h.auth, { isSystemAdmin: true });
        await onlyAdmins(h.auth, a.id);
        return a;
    };

    it('GET /admin/users pages through auth with the safe row shape and the filters applied', async () => {
        const a = await makeAdmin();
        const target = await makeUser(h.auth);
        const res = await get(`/admin/users?search=${target.username}&isVerified=true&page=1&pageSize=5`, a.token);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 5 });
        expect(Object.keys(res.body.rows[0]).sort()).toEqual(
            ['id', 'email', 'username', 'name', 'bio', 'avatar', 'banner', 'role', 'isSystemAdmin', 'isVerified', 'isBanned', 'deletedAt', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'].sort()
        );
        expect(res.body.rows[0]).toMatchObject({ id: target.id, role: 'STUDENT', deletedAt: null });
        expect(JSON.stringify(res.body)).not.toContain('password');
        const none = await get(`/admin/users?search=${target.username}&isVerified=false`, a.token);
        expect(none.body.total).toBe(0);
    });

    it('PATCH /admin/users/:id: auth writes the row + auth.user.updated in one tx, admin writes one audit row per field', async () => {
        const a = await makeAdmin();
        const target = await makeUser(h.auth);
        const res = await h.http().patch(`/admin/users/${target.id}`).set(bearer(a.token)).send({ name: 'Patched', bio: 'hello' });
        expect(res.status).toBe(200);
        expect(res.body.changedFields.sort()).toEqual(['bio', 'name']);
        expect(res.body.user).toMatchObject({ id: target.id, name: 'Patched', bio: 'hello' });

        const row = await h.auth.prisma.user.findUniqueOrThrow({ where: { id: target.id } });
        expect(row).toMatchObject({ name: 'Patched', updatedBy: a.id });
        const events = await h.auth.prisma.outboxEvent.findMany({
            where: { type: 'auth.user.updated', envelope: { path: ['data', 'userId'], equals: target.id } },
        });
        expect(events).toHaveLength(1);
        expect((events[0].envelope as { data: { version: number } }).data.version).toBe(row.updatedAt.getTime());
        const audit = await h.adminDb.adminAudit.findMany({ where: { targetId: target.id, action: 'admin.user.update' } });
        expect(audit).toHaveLength(2);
        expect(audit.every((r) => r.adminId === a.id)).toBe(true);

        const noop = await h.http().patch(`/admin/users/${target.id}`).set(bearer(a.token)).send({ name: 'Patched' });
        expect(noop.body.changedFields).toEqual([]);
        expect(await h.auth.prisma.outboxEvent.count({ where: { type: 'auth.user.updated', envelope: { path: ['data', 'userId'], equals: target.id } } })).toBe(1);
    });

    it('PATCH by a non-admin is refused before auth; an unknown user is 404', async () => {
        const a = await makeAdmin();
        const student = await makeUser(h.auth);
        const denied = await h.http().patch(`/admin/users/${a.id}`).set(bearer(student.token)).send({ name: 'x' });
        expect(denied.status).toBe(403);
        const missing = await h.http().patch('/admin/users/ghost').set(bearer(a.token)).send({ name: 'x' });
        expect(missing.status).toBe(404);
    });

    it('GET /admin/users/:id = auth detail + finance wallet/subscription, shape unchanged', async () => {
        const a = await makeAdmin();
        const target = await makeUser(h.auth);
        const res = await get(`/admin/users/${target.id}`, a.token);
        expect(res.status).toBe(200);
        expect(Object.keys(res.body).sort()).toEqual(['financeUnavailable', 'lastSession', 'subscription', 'user', 'wallet']);
        expect(res.body.wallet).toEqual({ id: 'w1', balance: 12 });
        expect(res.body.subscription).toMatchObject({ tier: 1 });
        expect(res.body.lastSession).toMatchObject({ isActive: true });
        expect((await get('/admin/users/ghost', a.token)).status).toBe(404);
    });

    it('GET /admin/overview combines auth counts with finance aggregates', async () => {
        const a = await makeAdmin();
        // The 5-minute cache is shared with earlier runs of this suite.
        await h.admin.get(RedisService).delPattern('admin:stats:*');
        const res = await get('/admin/overview', a.token);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ proCount: 3, vipCount: 1, revenue30d: 12345 });
        expect(res.body.totalUsers).toBeGreaterThan(0);
        expect(res.body.activeToday).toBeGreaterThanOrEqual(1);
    });

    it('GET /admin/series/signups counts today signups from auth with continuous points', async () => {
        const a = await makeAdmin();
        const res = await get('/admin/series/signups?range=7d', a.token);
        expect(res.status).toBe(200);
        expect(res.body.points).toHaveLength(7);
        expect(res.body.points.reduce((n: number, p: { value: number }) => n + p.value, 0)).toBeGreaterThan(0);
    });

    it('a student token cannot read stats', async () => {
        const s = await makeUser(h.auth);
        expect((await get('/admin/overview', s.token)).status).toBe(403);
    });

    it('PATCH /admin/page-config/:key writes the DB then pushes the full map to the gateway (admin writes no Redis key)', async () => {
        const a = await makeAdmin();
        gateway.setPageFlags.mockClear();
        const res = await h.http().patch('/admin/page-config/study-room').set(bearer(a.token)).send({ enabled: false });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ key: 'study-room', enabled: false });
        expect(gateway.setPageFlags).toHaveBeenCalledTimes(1);
        expect(gateway.setPageFlags.mock.calls[0][0]).toMatchObject({ 'study-room': false });
        await h.http().patch('/admin/page-config/study-room').set(bearer(a.token)).send({ enabled: true }).expect(200);
    });

    it('a gateway failure is surfaced (retryable) after the DB write', async () => {
        const a = await makeAdmin();
        gateway.setPageFlags.mockRejectedValueOnce(Object.assign(new Error('down'), { status: 503 }));
        const res = await h.http().patch('/admin/page-config/study-room').set(bearer(a.token)).send({ enabled: true });
        expect(res.status).toBeGreaterThanOrEqual(500);
    });
});
