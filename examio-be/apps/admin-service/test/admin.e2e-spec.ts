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

/**
 * Admin surface behind the REAL stateless guards: requests carry test-signed
 * RS256 tokens (no guard mocks); only Prisma is faked.
 */
const ADMIN_ID = 'admin-1';

function fakePrisma() {
    const user = { id: 'user-1', email: 'u@e.com', isSystemAdmin: false, isBanned: false };
    const prisma: Record<string, unknown> = {
        user: {
            findUnique: jest.fn().mockResolvedValue(user),
            findMany: jest.fn().mockResolvedValue([user]),
            count: jest.fn().mockResolvedValue(1),
            update: jest.fn().mockResolvedValue({ ...user, isSystemAdmin: true }),
        },
        wallet: { findUnique: jest.fn().mockResolvedValue({ id: 'w1', balance: 100 }) },
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
    const authClient = { setSystemAdmin: jest.fn(async () => ({})) };

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
        });

        it('filters by isSystemAdmin (renamed from isAdmin)', async () => {
            await request(app.getHttpServer()).get('/admin/users?isSystemAdmin=true').set(await admin()).expect(200);
            const where = (prisma.user as { findMany: jest.Mock }).findMany.mock.calls.at(-1)?.[0].where;
            expect(where).toMatchObject({ isSystemAdmin: true });
            expect(where).not.toHaveProperty('isAdmin');
        });

        it('a combined TEACHER + SYSTEM_ADMIN token passes (permissions are the union)', async () => {
            await request(app.getHttpServer())
                .get('/admin/users')
                .set(await as({ sub: ADMIN_ID, roles: ['TEACHER', 'SYSTEM_ADMIN'] }))
                .expect(200);
        });

        it('PATCH with isSystemAdmin is 400 (admin changes go through grant/revoke -> auth)', async () => {
            const res = await request(app.getHttpServer())
                .patch('/admin/users/user-1')
                .set(await admin())
                .send({ isSystemAdmin: false });
            expect(res.status).toBe(400);
            expect((prisma.user as { update: jest.Mock }).update).not.toHaveBeenCalled();
        });

        it('POST /admin/users/:id/grant-admin calls auth with the admin token and writes the audit row', async () => {
            const headers = await admin();
            const res = await request(app.getHttpServer())
                .post('/admin/users/user-1/grant-admin')
                .set(headers);
            expect(res.status).toBe(200);
            const [targetId, flag, metadata] = authClient.setSystemAdmin.mock.calls.at(-1) as unknown as [string, boolean, { get(k: string): string[] }];
            expect([targetId, flag]).toEqual(['user-1', true]);
            expect(metadata.get('authorization')).toEqual([headers.authorization]);
            expect(res.body).toHaveProperty('user');
            expect((prisma.adminAudit as { create: jest.Mock }).create).toHaveBeenCalled();
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
