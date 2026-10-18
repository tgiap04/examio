import { Metadata } from '@grpc/grpc-js';
import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { lastValueFrom } from 'rxjs';
import { PrismaService } from '@examio/database';
import { authV1, PROTO_FILES } from '@examio/contracts';
import { createTestGrpcClient, startTestGrpcServer, TestGrpcServer } from '@examio/grpc/testing';
import { AuthJwtModule, createTokenVerifier } from '@examio/auth-jwt';
import {
    TEST_AUDIENCE,
    TEST_ISSUER,
    createTestKeyPair,
    serviceClaims,
    signTestToken,
    type TestKeyPair,
} from '@examio/auth-jwt/testing';
import { AuthGrpcController } from '../src/grpc/auth.grpc.controller';
import { UsersQueryService } from '../src/grpc/users-query.service';
import { RoleChangeService } from '../src/roles/role-change.service';

const protos = [PROTO_FILES.auth];

const row = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    email: `${id}@x.dev`,
    username: id,
    name: `Name ${id}`,
    avatar: null,
    role: 'STUDENT',
    isSystemAdmin: false,
    isVerified: true,
    isBanned: false,
    deletedAt: null,
    createdAt: new Date(1_700_000_000_000),
    ...extra,
});

describe('AuthService gRPC contract (handlers behind the real guards)', () => {
    let server: TestGrpcServer;
    let auth: authV1.AuthServiceClient;
    let keys: TestKeyPair;
    const prisma = {
        user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn(), count: jest.fn() },
        roleChangeLog: { findMany: jest.fn(), count: jest.fn() },
        $transaction: jest.fn(),
    };
    const roles = { change: jest.fn() };

    const md = (token?: string) => {
        const m = new Metadata();
        if (token) m.set('authorization', `Bearer ${token}`);
        return m;
    };
    const asAdmin = async () => md(await signTestToken(keys, { claims: { sub: 'admin-1', roles: ['SYSTEM_ADMIN'] } }));
    const asService = async (name: string) =>
        md(await signTestToken(keys, { claims: serviceClaims(name), audience: 'auth' }));

    beforeAll(async () => {
        keys = await createTestKeyPair('k1');
        const moduleRef = await Test.createTestingModule({
            imports: [
                AuthJwtModule.forRoot({
                    serviceName: 'auth',
                    verifier: {
                        useFactory: () =>
                            createTokenVerifier({
                                issuer: TEST_ISSUER,
                                audiences: [TEST_AUDIENCE, 'auth'],
                                localJwks: { keys: [keys.publicJwk] },
                            }),
                    },
                }),
            ],
            controllers: [AuthGrpcController],
            providers: [
                UsersQueryService,
                { provide: PrismaService, useValue: prisma },
                { provide: RoleChangeService, useValue: roles },
            ],
        }).compile();
        server = await startTestGrpcServer(moduleRef, protos);
        auth = createTestGrpcClient(server.url, protos).getService<authV1.AuthServiceClient>(
            authV1.AUTH_SERVICE_NAME
        );
    });

    afterAll(() => server.close());
    beforeEach(() => jest.resetAllMocks());

    describe('guards', () => {
        it('a call without metadata is UNAUTHENTICATED', async () => {
            await expect(lastValueFrom(auth.getUser({ userId: 'u' }, md()))).rejects.toMatchObject({ code: 16 });
        });

        it('a STUDENT user token on GetUsersByIds (email-bearing) is PERMISSION_DENIED', async () => {
            const student = md(await signTestToken(keys, { claims: { roles: ['STUDENT'] } }));
            await expect(
                lastValueFrom(auth.getUsersByIds({ userIds: ['a'] }, student))
            ).rejects.toMatchObject({ code: 7 });
            expect(prisma.user.findMany).not.toHaveBeenCalled();
        });

        it('svc:admin may call GetUsersByIds, svc:exam may not', async () => {
            prisma.user.findMany.mockResolvedValue([row('a')]);
            const ok = await lastValueFrom(auth.getUsersByIds({ userIds: ['a'] }, await asService('admin')));
            expect(ok.users[0].email).toBe('a@x.dev');
            await expect(
                lastValueFrom(auth.getUsersByIds({ userIds: ['a'] }, await asService('exam')))
            ).rejects.toMatchObject({ code: 7 });
        });

        it('role writes need role:assign: a TEACHER and a service token are PERMISSION_DENIED', async () => {
            const teacher = md(await signTestToken(keys, { claims: { roles: ['TEACHER'] } }));
            await expect(
                lastValueFrom(auth.setUserRole({ userId: 'u', role: 2, reason: '' }, teacher))
            ).rejects.toMatchObject({ code: 7 });
            await expect(
                lastValueFrom(auth.setUserRole({ userId: 'u', role: 2, reason: '' }, await asService('admin')))
            ).rejects.toMatchObject({ code: 7 });
            expect(roles.change).not.toHaveBeenCalled();
        });
    });

    describe('reads', () => {
        it('GetUsersByIds returns users in input order and omits unknown ids', async () => {
            prisma.user.findMany.mockResolvedValue([row('c'), row('a'), row('b')]);
            const res = await lastValueFrom(
                auth.getUsersByIds({ userIds: ['b', 'ghost', 'a', 'c', 'a'] }, await asService('admin'))
            );
            expect(res.users.map((u) => u.id)).toEqual(['b', 'a', 'c']);
            expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
            expect(prisma.user.findMany.mock.calls[0][0].where.id.in).toEqual(['b', 'ghost', 'a', 'c']);
        });

        it('maps role and isSystemAdmin from the row', async () => {
            prisma.user.findUnique.mockResolvedValue(row('adm', { isSystemAdmin: true, role: 'TEACHER' }));
            const { user } = await lastValueFrom(auth.getUser({ userId: 'adm' }, await asService('admin')));
            expect(user).toMatchObject({
                id: 'adm',
                email: 'adm@x.dev',
                isSystemAdmin: true,
                role: authV1.BaseRole.BASE_ROLE_TEACHER,
                createdAt: '1700000000000',
            });
        });

        it('GetUser on a missing or soft-deleted user is NOT_FOUND', async () => {
            const caller = await asService('admin');
            prisma.user.findUnique.mockResolvedValueOnce(null);
            await expect(lastValueFrom(auth.getUser({ userId: 'x' }, caller))).rejects.toMatchObject({ code: 5 });
            prisma.user.findUnique.mockResolvedValueOnce(row('d', { deletedAt: new Date() }));
            await expect(lastValueFrom(auth.getUser({ userId: 'd' }, caller))).rejects.toMatchObject({ code: 5 });
        });

        it('GetUsersByIds rejects batches over 500 ids', async () => {
            const userIds = Array.from({ length: 501 }, (_, i) => `u${i}`);
            await expect(
                lastValueFrom(auth.getUsersByIds({ userIds }, await asService('admin')))
            ).rejects.toMatchObject({ code: 3 });
            expect(prisma.user.findMany).not.toHaveBeenCalled();
        });

        it('FindUserByEmail lower-cases the email', async () => {
            prisma.user.findUnique.mockResolvedValue(row('e'));
            await lastValueFrom(auth.findUserByEmail({ email: 'E@X.dev' }, await asService('finance')));
            expect(prisma.user.findUnique.mock.calls[0][0].where).toEqual({ email: 'e@x.dev' });
        });

        it('GetPublicProfilesByIds: any verified user or service, 4 fields only, one query, input order', async () => {
            prisma.user.findMany.mockResolvedValue([
                { id: 'b', username: 'b', name: null, avatar: 'a.png' },
                { id: 'a', username: 'a', name: 'A', avatar: null },
            ]);
            const student = md(await signTestToken(keys, { claims: { roles: ['STUDENT'] } }));
            const res = await lastValueFrom(
                auth.getPublicProfilesByIds({ userIds: ['a', 'ghost', 'b'] }, student)
            );
            expect(res.profiles.map((p) => p.id)).toEqual(['a', 'b']);
            for (const p of res.profiles) expect(Object.keys(p).sort()).toEqual(['avatar', 'id', 'name', 'username']);
            expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
            expect(prisma.user.findMany.mock.calls[0][0].select).toEqual({
                id: true, username: true, name: true, avatar: true,
            });
            // Also reachable by any service token.
            await expect(
                lastValueFrom(auth.getPublicProfilesByIds({ userIds: ['a'] }, await asService('exam')))
            ).resolves.toBeDefined();
        });

        it('ListUsers pages with one findMany + one count and applies role/admin/ban/query filters', async () => {
            prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
            prisma.user.findMany.mockResolvedValue([row('a'), row('b')]);
            prisma.user.count.mockResolvedValue(7);
            const res = await lastValueFrom(
                auth.listUsers(
                    { query: 'a', role: authV1.BaseRole.BASE_ROLE_TEACHER, isSystemAdmin: false, isBanned: false, page: 2, limit: 2 },
                    await asService('finance')
                )
            );
            expect(res.users).toHaveLength(2);
            expect(res.page).toEqual({ total: 7, page: 2, limit: 2 });
            const args = prisma.user.findMany.mock.calls[0][0];
            expect(args).toMatchObject({ skip: 2, take: 2 });
            expect(args.where).toMatchObject({ deletedAt: null, role: 'TEACHER', isSystemAdmin: false, isBanned: false });
        });

        it('ListRoleChanges (role:assign) pages the audit log newest first', async () => {
            prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
            prisma.roleChangeLog.findMany.mockResolvedValue([
                {
                    id: 'l1', targetUserId: 't', actorUserId: null, actorEmail: 'cli@system',
                    fromRole: 'STUDENT', toRole: 'TEACHER', fromAdmin: false, toAdmin: true,
                    reason: null, createdAt: new Date(1_700_000_000_000),
                },
            ]);
            prisma.roleChangeLog.count.mockResolvedValue(1);
            const res = await lastValueFrom(auth.listRoleChanges({ targetUserId: 't', page: 1, limit: 10 }, await asAdmin()));
            expect(res.changes[0]).toMatchObject({
                id: 'l1', changedBy: 'cli@system', toRole: authV1.BaseRole.BASE_ROLE_TEACHER, toIsSystemAdmin: true, reason: '',
            });
            expect(prisma.roleChangeLog.findMany.mock.calls[0][0].where).toEqual({ targetUserId: 't' });
        });
    });

    describe('role writes', () => {
        it('SetUserRole: the actor is the token sub, never a request field', async () => {
            roles.change.mockResolvedValue({ changed: true });
            prisma.user.findUniqueOrThrow.mockResolvedValue(row('t', { role: 'TEACHER' }));
            const res = await lastValueFrom(
                auth.setUserRole({ userId: 't', role: authV1.BaseRole.BASE_ROLE_TEACHER, reason: ' promote ' }, await asAdmin())
            );
            expect(res.user?.role).toBe(authV1.BaseRole.BASE_ROLE_TEACHER);
            expect(roles.change).toHaveBeenCalledWith({
                actor: { kind: 'user', userId: 'admin-1' },
                targetUserId: 't',
                role: 'TEACHER',
                reason: 'promote',
                source: 'admin-ui',
            });
        });

        it('SetUserRole rejects UNSPECIFIED role and missing user id', async () => {
            await expect(
                lastValueFrom(auth.setUserRole({ userId: 't', role: 0, reason: '' }, await asAdmin()))
            ).rejects.toMatchObject({ code: 3 });
            await expect(
                lastValueFrom(auth.setUserRole({ userId: '', role: 1, reason: '' }, await asAdmin()))
            ).rejects.toMatchObject({ code: 3 });
            expect(roles.change).not.toHaveBeenCalled();
        });

        it('SetSystemAdmin passes only the flag', async () => {
            roles.change.mockResolvedValue({ changed: true });
            prisma.user.findUniqueOrThrow.mockResolvedValue(row('t', { isSystemAdmin: true }));
            await lastValueFrom(auth.setSystemAdmin({ userId: 't', isSystemAdmin: true, reason: '' }, await asAdmin()));
            expect(roles.change).toHaveBeenCalledWith(
                expect.objectContaining({ targetUserId: 't', isSystemAdmin: true, source: 'admin-ui' })
            );
            expect(roles.change.mock.calls[0][0]).not.toHaveProperty('role');
        });

        it.each([
            [403, 'CANNOT_CHANGE_OWN_ROLE', 7],
            [404, 'USER_NOT_FOUND', 5],
            [409, 'LAST_SYSTEM_ADMIN', 10],
            [409, 'ROLE_CHANGE_CONFLICT', 10],
        ])('maps service error %i %s to gRPC status %i with the code as detail', async (httpStatus, code, grpc) => {
            roles.change.mockRejectedValue(new HttpException({ statusCode: httpStatus, code, message: 'x' }, httpStatus));
            await expect(
                lastValueFrom(auth.setSystemAdmin({ userId: 't', isSystemAdmin: false, reason: '' }, await asAdmin()))
            ).rejects.toMatchObject({ code: grpc, details: code });
        });

        it('SetUserStatus stays UNIMPLEMENTED until phase 08', async () => {
            await expect(
                lastValueFrom(auth.setUserStatus({ userId: 'u', isBanned: true, reason: '' }, await asAdmin()))
            ).rejects.toMatchObject({ code: 12 });
        });
    });
});
