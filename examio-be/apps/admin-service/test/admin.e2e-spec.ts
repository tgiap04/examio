import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '@examio/database';
import { TOKEN_VERIFIER, createTokenVerifier } from '@examio/auth-jwt';
import {
    TEST_AUDIENCE,
    TEST_ISSUER,
    createTestKeyPair,
    serviceClaims,
    signTestToken,
    type TestKeyPair,
} from '@examio/auth-jwt/testing';
import { join } from 'path';
import { AuthClient } from '../src/clients/auth.client';
import { AuthUsersClient } from '../src/clients/auth-users.client';
import { FinanceClient } from '../src/clients/finance.client';
import { GatewayClient } from '../src/clients/gateway.client';
import { VocabularyClient } from '../src/clients/vocabulary.client';

/**
 * Admin surface behind the REAL stateless guards: requests carry test-signed
 * RS256 tokens (no guard mocks); only Prisma is faked.
 */
const ADMIN_ID = 'admin-1';

function fakePrisma() {
    const prisma: Record<string, unknown> = {
        // admin owns no `User`/wallet table: any access here would be a regression.
        user: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
        pageFeatureFlag: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
        adminAudit: {
            create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
            findMany: jest.fn().mockResolvedValue([
                { id: 'audit-1', adminId: ADMIN_ID, action: 'admin.user.grant', targetId: 'user-1', payload: null, reason: null, createdAt: new Date(), admin: { id: ADMIN_ID, username: 'admin' } },
            ]),
            count: jest.fn().mockResolvedValue(1),
        },
    };
    prisma.$transaction = jest.fn(async (arg: unknown) =>
        typeof arg === 'function' ? (arg as (t: unknown) => unknown)(prisma) : Promise.all(arg as unknown[])
    );
    return prisma;
}

describe('AdminService (e2e, real guards)', () => {
    let app: INestApplication;
    let keys: TestKeyPair;
    let prisma: ReturnType<typeof fakePrisma>;
    const authUser = { id: 'user-1', email: 'u@e.com', username: 'u', name: 'U', avatar: '', role: 1, isSystemAdmin: false, isVerified: true, isBanned: false, createdAt: '1760000000000' };
    const authClient = {
        getUser: jest.fn(async () => ({ user: authUser })),
        setSystemAdmin: jest.fn(async () => ({ user: { ...authUser, isSystemAdmin: true } })),
        setUserStatus: jest.fn(async () => ({ user: authUser })),
        getUsersByIds: jest.fn(async () => ({ users: [] })),
        listUsers: jest.fn(async (..._a: unknown[]) => ({ users: [authUser], page: { total: 1, page: 1, limit: 20 } })),
    };
    const authUsers = {
        getUserStats: jest.fn(async () => ({ totalUsers: '1', activeToday: '1', activeLast30d: '1', signupsSeries: [], trafficSeries: [], utmSources: [] })),
        updateUserAdmin: jest.fn(),
    };
    const financeClient = { getRevenueStats: jest.fn(async () => ({ proUsers: 0, vipUsers: 0, revenueLast30d: '0', revenueSeries: [] })) };
    const gatewayClient = { setPageFlags: jest.fn(async () => undefined) };

    beforeAll(async () => {
        // Proto paths resolve against examio-be/; import lazily so the chdir applies.
        process.chdir(join(__dirname, '..', '..', '..'));
        const { AdminServiceModule } = await import('../src/admin-service.module');
        keys = await createTestKeyPair('admin-k');
        prisma = fakePrisma();
        const moduleRef = await Test.createTestingModule({ imports: [AdminServiceModule] })
            .overrideProvider(PrismaService)
            .useValue(prisma)
            .overrideProvider(AuthClient)
            .useValue(authClient)
            .overrideProvider(AuthUsersClient)
            .useValue(authUsers)
            .overrideProvider(FinanceClient)
            .useValue(financeClient)
            .overrideProvider(GatewayClient)
            .useValue(gatewayClient)
            .overrideProvider(VocabularyClient)
            .useValue({})
            .overrideProvider(TOKEN_VERIFIER)
            .useValue(
                createTokenVerifier({
                    issuer: TEST_ISSUER,
                    audiences: [TEST_AUDIENCE, 'admin'],
                    localJwks: { keys: [keys.publicJwk] },
                })
            )
            .compile();
        app = moduleRef.createNestApplication();
        await app.init();
    });
    afterAll(async () => {
        await app?.close();
    });

    const as = async (claims: Record<string, unknown>, o: { audience?: string } = {}) => ({
        authorization: `Bearer ${await signTestToken(keys, { claims, ...o })}`,
    });
    const admin = (over: Record<string, unknown> = {}) =>
        as({ sub: ADMIN_ID, roles: ['SYSTEM_ADMIN'], ...over });

    describe('SYSTEM_ADMIN token', () => {
        it('GET /admin/users returns the paginated list', async () => {
            const res = await request(app.getHttpServer())
                .get('/admin/users?page=1&pageSize=20')
                .set(await admin());
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.rows)).toBe(true);
            expect(res.body.rows[0]).toMatchObject({ id: 'user-1', role: 'STUDENT' });
            expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
            expect(res.body.rows[0]).not.toHaveProperty('password');
        });

        it('forwards the caller token to auth and never queries the User table', async () => {
            const headers = await admin();
            await request(app.getHttpServer()).get('/admin/users').set(headers).expect(200);
            const md = authClient.listUsers.mock.calls.at(-1)?.[1] as unknown as { get(k: string): string[] };
            expect(md.get('authorization')).toEqual([headers.authorization]);
            expect((prisma.user as { findMany: jest.Mock }).findMany).not.toHaveBeenCalled();
        });

        it('filters by isSystemAdmin (renamed from isAdmin)', async () => {
            await request(app.getHttpServer()).get('/admin/users?isSystemAdmin=true').set(await admin()).expect(200);
            const req = authClient.listUsers.mock.calls.at(-1)?.[0] as unknown as Record<string, unknown>;
            expect(req).toMatchObject({ isSystemAdmin: true });
            expect(req).not.toHaveProperty('isAdmin');
        });

        it('a combined TEACHER + SYSTEM_ADMIN token passes (permissions are the union)', async () => {
            await request(app.getHttpServer())
                .get('/admin/users')
                .set(await as({ sub: ADMIN_ID, roles: ['TEACHER', 'SYSTEM_ADMIN'] }))
                .expect(200);
        });

        it('PATCH with isSystemAdmin or isBanned is 400 (those go through auth)', async () => {
            for (const body of [{ isSystemAdmin: false }, { isBanned: true }]) {
                const res = await request(app.getHttpServer())
                    .patch('/admin/users/user-1')
                    .set(await admin())
                    .send(body);
                expect([res.status, res.body.code]).toEqual([400, 'VALIDATION_ERROR']);
            }
            expect((prisma.user as { update: jest.Mock }).update).not.toHaveBeenCalled();
        });

        it('PUT /admin/roles/users/:id/system-admin calls auth with the admin token and writes the audit row', async () => {
            const headers = await admin();
            const res = await request(app.getHttpServer())
                .put('/admin/roles/users/user-1/system-admin')
                .set(headers)
                .send({ isSystemAdmin: true, reason: 'ok' });
            expect(res.status).toBe(200);
            const [targetId, flag, metadata, reason] = authClient.setSystemAdmin.mock.calls.at(-1) as unknown as [string, boolean, { get(k: string): string[] }, string];
            expect([targetId, flag, reason]).toEqual(['user-1', true, 'ok']);
            expect(metadata.get('authorization')).toEqual([headers.authorization]);
            expect(res.body.user).toMatchObject({ id: 'user-1', isSystemAdmin: true });
            expect((prisma.adminAudit as { create: jest.Mock }).create).toHaveBeenCalled();
        });

        it('POST /admin/users/:id/ban goes through auth SetUserStatus and never writes User', async () => {
            const headers = await admin();
            await request(app.getHttpServer()).post('/admin/users/user-1/ban').set(headers).expect(200);
            const [, isBanned, metadata] = authClient.setUserStatus.mock.calls.at(-1) as unknown as [string, boolean, { get(k: string): string[] }];
            expect(isBanned).toBe(true);
            expect(metadata.get('authorization')).toEqual([headers.authorization]);
            expect((prisma.user as { update: jest.Mock }).update).not.toHaveBeenCalled();
        });

        it('GET /admin/roles is the catalog; a bad body or query is 400 VALIDATION_ERROR', async () => {
            const res = await request(app.getHttpServer()).get('/admin/roles').set(await admin()).expect(200);
            expect(res.body.roles.map((r: { key: string }) => r.key)).toEqual(['STUDENT', 'TEACHER', 'SYSTEM_ADMIN']);
            const bad = await request(app.getHttpServer())
                .put('/admin/roles/users/user-1/role')
                .set(await admin())
                .send({ role: 'SYSTEM_ADMIN' });
            expect([bad.status, bad.body.code]).toEqual([400, 'VALIDATION_ERROR']);
            const badQuery = await request(app.getHttpServer()).get('/admin/roles/users?limit=101').set(await admin());
            expect([badQuery.status, badQuery.body.code]).toEqual([400, 'VALIDATION_ERROR']);
        });

        it.each([['STUDENT'], ['TEACHER']])('a %s token is 403 on every /admin/roles route', async (role) => {
            const h = await as({ sub: 'u', roles: [role] });
            const server = app.getHttpServer();
            const results = await Promise.all([
                request(server).get('/admin/roles').set(h),
                request(server).get('/admin/roles/users').set(h),
                request(server).get('/admin/roles/changes').set(h),
                request(server).put('/admin/roles/users/user-1/role').set(h).send({ role: 'TEACHER' }),
                request(server).put('/admin/roles/users/user-1/system-admin').set(h).send({ isSystemAdmin: true }),
            ]);
            expect(results.map((r) => [r.status, r.body.code])).toEqual(Array(5).fill([403, 'PERMISSION_DENIED']));
        });

        it('GET /admin/audit is served; /admin/stats/overview passes the guards (its queries are not faked here)', async () => {
            await request(app.getHttpServer()).get('/admin/audit?action=admin.user.grant').set(await admin()).expect(200);
            const stats = await request(app.getHttpServer()).get('/admin/stats/overview').set(await admin());
            expect([401, 403]).not.toContain(stats.status);
            const student = await request(app.getHttpServer())
                .get('/admin/stats/overview')
                .set(await as({ sub: 'u', roles: ['STUDENT'] }));
            expect(student.status).toBe(403);
        });
    });

    describe('everyone else is refused', () => {
        it.each([['STUDENT'], ['TEACHER']])('a %s token is 403 PERMISSION_DENIED', async (role) => {
            const res = await request(app.getHttpServer())
                .get('/admin/users')
                .set(await as({ sub: 'u', roles: [role] }));
            expect([res.status, res.body.code]).toEqual([403, 'PERMISSION_DENIED']);
        });

        it('an unverified admin is 403 EMAIL_NOT_VERIFIED', async () => {
            const res = await request(app.getHttpServer())
                .get('/admin/users')
                .set(await admin({ email_verified: false }));
            expect([res.status, res.body.code]).toEqual([403, 'EMAIL_NOT_VERIFIED']);
        });

        it('a service token is 403 (admin routes are user-only)', async () => {
            const res = await request(app.getHttpServer())
                .get('/admin/users')
                .set(await as(serviceClaims('exam'), { audience: 'admin' }));
            expect(res.status).toBe(403);
        });

        it('no token is 401 TOKEN_MISSING; a token for another audience is 401 TOKEN_INVALID', async () => {
            const none = await request(app.getHttpServer()).get('/admin/users');
            expect([none.status, none.body.code]).toEqual([401, 'TOKEN_MISSING']);
            const wrongAud = await request(app.getHttpServer())
                .get('/admin/users')
                .set(await admin().then(async () => as({ sub: ADMIN_ID, roles: ['SYSTEM_ADMIN'] }, { audience: 'finance' })));
            expect([wrongAud.status, wrongAud.body.code]).toEqual([401, 'TOKEN_INVALID']);
        });
    });
});
