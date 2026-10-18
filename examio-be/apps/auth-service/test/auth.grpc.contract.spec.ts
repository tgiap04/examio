import { Metadata } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { lastValueFrom } from 'rxjs';
import { PrismaService } from '@examio/database';
import { authV1, PROTO_FILES } from '@examio/contracts';
import { createTestGrpcClient, startTestGrpcServer, TestGrpcServer } from '@examio/grpc/testing';
import { AuthGrpcController } from '../src/grpc/auth.grpc.controller';

const protos = [PROTO_FILES.auth];

const row = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    email: `${id}@x.dev`,
    username: id,
    name: `Name ${id}`,
    avatar: null,
    isAdmin: false,
    isVerified: true,
    isBanned: false,
    deletedAt: null,
    createdAt: new Date(1_700_000_000_000),
    ...extra,
});

describe('AuthService gRPC contract', () => {
    let server: TestGrpcServer;
    let auth: authV1.AuthServiceClient;
    const prisma = {
        user: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
        $transaction: jest.fn(),
    };
    const md = () => new Metadata();

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [AuthGrpcController],
            providers: [{ provide: PrismaService, useValue: prisma }],
        }).compile();
        server = await startTestGrpcServer(moduleRef, protos);
        auth = createTestGrpcClient(server.url, protos).getService<authV1.AuthServiceClient>(
            authV1.AUTH_SERVICE_NAME
        );
    });

    afterAll(() => server.close());
    beforeEach(() => jest.clearAllMocks());

    it('GetUsersByIds returns users in input order and omits unknown ids', async () => {
        // DB returns in arbitrary order and lacks "ghost".
        prisma.user.findMany.mockResolvedValue([row('c'), row('a'), row('b')]);
        const res = await lastValueFrom(
            auth.getUsersByIds({ userIds: ['b', 'ghost', 'a', 'c', 'a'] }, md())
        );
        expect(res.users.map((u) => u.id)).toEqual(['b', 'a', 'c']);
        expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.user.findMany.mock.calls[0][0].where.id.in).toEqual(['b', 'ghost', 'a', 'c']);
    });

    it('maps isAdmin to isSystemAdmin and defaults role to STUDENT', async () => {
        prisma.user.findUnique.mockResolvedValue(row('adm', { isAdmin: true }));
        const { user } = await lastValueFrom(auth.getUser({ userId: 'adm' }, md()));
        expect(user).toMatchObject({
            id: 'adm',
            email: 'adm@x.dev',
            isSystemAdmin: true,
            role: authV1.BaseRole.BASE_ROLE_STUDENT,
            createdAt: '1700000000000',
        });
    });

    it('GetUser on a missing or soft-deleted user is NOT_FOUND', async () => {
        prisma.user.findUnique.mockResolvedValueOnce(null);
        await expect(lastValueFrom(auth.getUser({ userId: 'x' }, md()))).rejects.toMatchObject({ code: 5 });
        prisma.user.findUnique.mockResolvedValueOnce(row('d', { deletedAt: new Date() }));
        await expect(lastValueFrom(auth.getUser({ userId: 'd' }, md()))).rejects.toMatchObject({ code: 5 });
    });

    it('GetUsersByIds rejects batches over 500 ids', async () => {
        const userIds = Array.from({ length: 501 }, (_, i) => `u${i}`);
        await expect(lastValueFrom(auth.getUsersByIds({ userIds }, md()))).rejects.toMatchObject({ code: 3 });
        expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('FindUserByEmail lower-cases the email', async () => {
        prisma.user.findUnique.mockResolvedValue(row('e'));
        await lastValueFrom(auth.findUserByEmail({ email: 'E@X.dev' }, md()));
        expect(prisma.user.findUnique.mock.calls[0][0].where).toEqual({ email: 'e@x.dev' });
    });

    it('ListUsers pages with one findMany + one count', async () => {
        prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
        prisma.user.findMany.mockResolvedValue([row('a'), row('b')]);
        prisma.user.count.mockResolvedValue(7);
        const res = await lastValueFrom(
            auth.listUsers({ query: 'a', isBanned: false, page: 2, limit: 2 }, md())
        );
        expect(res.users).toHaveLength(2);
        expect(res.page).toEqual({ total: 7, page: 2, limit: 2 });
        const args = prisma.user.findMany.mock.calls[0][0];
        expect(args).toMatchObject({ skip: 2, take: 2 });
        expect(args.where).toMatchObject({ deletedAt: null, isBanned: false });
    });

    it('ListUsers with role=TEACHER is empty until phase 04 stores roles', async () => {
        const res = await lastValueFrom(
            auth.listUsers({ query: '', role: authV1.BaseRole.BASE_ROLE_TEACHER, page: 1, limit: 10 }, md())
        );
        expect(res.users).toEqual([]);
        expect(res.page?.total).toBe(0);
    });

    it.each([
        ['setUserRole', { userId: 'u', role: 1, reason: '' }],
        ['setSystemAdmin', { userId: 'u', isSystemAdmin: true, reason: '' }],
        ['setUserStatus', { userId: 'u', isBanned: true, reason: '' }],
        ['listRoleChanges', { page: 1, limit: 10 }],
        ['getPublicProfilesByIds', { userIds: ['u'] }],
    ] as const)('%s is UNIMPLEMENTED until its owning phase', async (method, req) => {
        const call = (auth[method] as unknown as (r: unknown, m: Metadata) => ReturnType<typeof auth.getUser>)(req, md());
        await expect(lastValueFrom(call)).rejects.toMatchObject({ code: 12 });
    });
});
