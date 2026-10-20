import { randomUUID } from 'crypto';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { GenerateIdService } from '@examio/common';
import { PrismaService } from '@examio/database';
import { RedisService } from '@examio/redis';
import { HEALTH_ROUTES_EXCLUDED_FROM_PREFIX } from '@examio/observability';
import {
    createTestKeyPair,
    signTestToken,
    type TestKeyPair,
} from '@examio/auth-jwt/testing';

/**
 * Read-after-write on the wallet cache (real Redis): every balance change,
 * wherever it is written (finance gRPC, admin credit/refund), must be visible to
 * the very next GET /wallet/info and /wallet/details.
 */
describe('wallet cache coherence (e2e)', () => {
    let app: INestApplication;
    let jwks: Server;
    let keys: TestKeyPair;
    let prisma: PrismaService;
    const ids: string[] = [];

    beforeAll(async () => {
        keys = await createTestKeyPair('wc-k');
        jwks = createServer((_req, res) => {
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ keys: [keys.publicJwk] }));
        });
        await new Promise<void>((r) => jwks.listen(0, '127.0.0.1', r));
        process.env.AUTH_JWKS_URL = `http://127.0.0.1:${(jwks.address() as AddressInfo).port}/jwks`;
        const { FinanceServiceModule } =
            await import('../src/finance-service.module');
        const moduleRef = await Test.createTestingModule({
            imports: [FinanceServiceModule],
        }).compile();
        app = moduleRef.createNestApplication();
        app.setGlobalPrefix('api/v1', {
            exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
        });
        await app.init();
        prisma = app.get(PrismaService);
    });
    afterAll(async () => {
        await Promise.race([
            app.close(),
            new Promise((r) => setTimeout(r, 5000)),
        ]);
        await new Promise((r) => jwks.close(r));
        await prisma.walletTransaction.deleteMany({
            where: { wallet: { userId: { in: ids } } },
        });
        await prisma.payment.deleteMany({ where: { userId: { in: ids } } });
        await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
    });

    async function teacherWithWallet(balance = 20) {
        const id = `wc_${randomUUID().replace(/-/g, '').slice(0, 18)}`;
        ids.push(id);
        await prisma.user.create({
            data: {
                id,
                email: `${id}@e2e.test`,
                username: id,
                role: 'TEACHER',
            },
        });
        const wallet = await prisma.wallet.create({
            data: { id: `w_${id}`, userId: id, balance },
        });
        const token = await signTestToken(keys, {
            claims: { sub: id, roles: ['TEACHER'], email_verified: true },
            audience: 'examio',
        });
        return { id, walletId: wallet.id, token };
    }

    const info = (token: string) =>
        request(app.getHttpServer())
            .get('/api/v1/wallet/info')
            .set('authorization', `Bearer ${token}`);
    const details = (token: string) =>
        request(app.getHttpServer())
            .get('/api/v1/wallet/details')
            .set('authorization', `Bearer ${token}`);

    it('gRPC UpdateBalance SUBTRACT, then the very next wallet read shows the new balance', async () => {
        const u = await teacherWithWallet(20);
        expect((await info(u.token)).body.balance).toBe(20);
        expect((await details(u.token)).status).toBe(200); // primes the details caches

        const { WalletGrpcController } =
            await import('../src/modules/wallet/wallet.grpc.controller');
        const grpc = app.get(WalletGrpcController);
        const res = await grpc.updateBalance({
            userId: u.id,
            amount: 7,
            transactionType: 'SUBTRACT',
            description: 'e2e debit',
        });
        expect(res).toMatchObject({ success: true, newBalance: 13 });

        expect((await info(u.token)).body.balance).toBe(13);
        const d = await details(u.token);
        expect(d.body.balance).toBe(13);
        expect(JSON.stringify(d.body)).toContain('e2e debit');
    });

    it('gRPC UpdateBalance ADD is visible at once too', async () => {
        const u = await teacherWithWallet(20);
        expect((await info(u.token)).body.balance).toBe(20);
        const { WalletGrpcController } =
            await import('../src/modules/wallet/wallet.grpc.controller');
        await app.get(WalletGrpcController).updateBalance({
            userId: u.id,
            amount: 5,
            transactionType: 'ADD',
            description: 'e2e add',
        });
        expect((await info(u.token)).body.balance).toBe(25);
    });

    it('admin credit +50, then GET /wallet/info shows the new balance at once', async () => {
        const u = await teacherWithWallet(20);
        expect((await info(u.token)).body.balance).toBe(20);
        expect((await details(u.token)).status).toBe(200);

        const { AdminFinanceService } =
            await import('../../admin-service/src/modules/admin-finance/admin-finance.service');
        const admin = new AdminFinanceService(
            prisma,
            { write: async () => undefined } as never,
            new GenerateIdService(),
            app.get(RedisService)
        );
        const credited = await admin.credit(
            {
                userId: u.id,
                amount: 50,
                direction: 'ADD',
                reason: 'e2e',
            } as never,
            { adminId: 'admin-e2e', ipAddress: '127.0.0.1', userAgent: 'jest' }
        );
        expect(credited.newBalance).toBe(70);

        expect((await info(u.token)).body.balance).toBe(70);
        const d = await details(u.token);
        expect(d.body.balance).toBe(70);
        expect(JSON.stringify(d.body)).toContain('Admin adjustment');
    });

    it('admin refund of a credits payment lowers the wallet at once', async () => {
        const u = await teacherWithWallet(100);
        expect((await info(u.token)).body.balance).toBe(100);
        await prisma.payment.create({
            data: {
                id: `p_${u.id}`,
                userId: u.id,
                amount: 30,
                currency: 'VND',
                status: 1,
                paymentType: 'credits',
            },
        });
        const { AdminFinanceService } =
            await import('../../admin-service/src/modules/admin-finance/admin-finance.service');
        const admin = new AdminFinanceService(
            prisma,
            { write: async () => undefined } as never,
            new GenerateIdService(),
            app.get(RedisService)
        );
        await admin.refund({ paymentId: `p_${u.id}`, reason: 'e2e' } as never, {
            adminId: 'admin-e2e',
            ipAddress: '127.0.0.1',
            userAgent: 'jest',
        });
        expect((await info(u.token)).body.balance).toBe(70);
    });

    describe('a Redis failure after commit never changes the outcome', () => {
        afterEach(() => jest.restoreAllMocks());

        it('gRPC UpdateBalance still succeeds, the balance is committed once', async () => {
            const u = await teacherWithWallet(20);
            jest.spyOn(RedisService.prototype, 'del').mockRejectedValue(
                new Error('redis down')
            );
            jest.spyOn(RedisService.prototype, 'delPattern').mockRejectedValue(
                new Error('redis down')
            );
            const { WalletGrpcController } =
                await import('../src/modules/wallet/wallet.grpc.controller');
            const res = await app.get(WalletGrpcController).updateBalance({
                userId: u.id,
                amount: 6,
                transactionType: 'SUBTRACT',
                description: 'e2e redis down',
            });
            expect(res).toMatchObject({ success: true, newBalance: 14 });
            expect(
                (
                    await prisma.wallet.findUniqueOrThrow({
                        where: { userId: u.id },
                    })
                ).balance
            ).toBe(14);
            expect(
                await prisma.walletTransaction.count({
                    where: {
                        walletId: u.walletId,
                        description: 'e2e redis down',
                    },
                })
            ).toBe(1);
        });

        it('admin credit and refund still return their committed result', async () => {
            const u = await teacherWithWallet(10);
            jest.spyOn(RedisService.prototype, 'del').mockRejectedValue(
                new Error('redis down')
            );
            jest.spyOn(RedisService.prototype, 'delPattern').mockRejectedValue(
                new Error('redis down')
            );
            const { AdminFinanceService } =
                await import('../../admin-service/src/modules/admin-finance/admin-finance.service');
            const admin = new AdminFinanceService(
                prisma,
                { write: async () => undefined } as never,
                new GenerateIdService(),
                app.get(RedisService)
            );
            const ctx = {
                adminId: 'admin-e2e',
                ipAddress: '127.0.0.1',
                userAgent: 'jest',
            };
            const credited = await admin.credit(
                {
                    userId: u.id,
                    amount: 5,
                    direction: 'ADD',
                    reason: 'e2e',
                } as never,
                ctx
            );
            expect(credited.newBalance).toBe(15);
            await prisma.payment.create({
                data: {
                    id: `p_${u.id}`,
                    userId: u.id,
                    amount: 4,
                    currency: 'VND',
                    status: 1,
                    paymentType: 'credits',
                },
            });
            const refunded = await admin.refund(
                { paymentId: `p_${u.id}`, reason: 'e2e' } as never,
                ctx
            );
            expect(refunded.walletAdjusted).toBe(true);
            expect(
                (
                    await prisma.wallet.findUniqueOrThrow({
                        where: { userId: u.id },
                    })
                ).balance
            ).toBe(11);
        });
    });
});
