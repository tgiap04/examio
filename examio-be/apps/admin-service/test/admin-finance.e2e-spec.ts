import { Controller, HttpException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Metadata, status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import * as request from 'supertest';
import { join } from 'path';
import { PrismaService } from '../src/prisma';
import { AuthUsersClient } from '../src/clients/auth-users.client';
import { PROTO_FILES, financeAdminV1 } from '@examio/contracts';
import { startTestGrpcServer, TestGrpcServer } from '@examio/grpc/testing';
import {
    AuthJwtModule,
    TOKEN_VERIFIER,
    RequirePermissions,
    createTokenVerifier,
    principalOfMetadata,
} from '@examio/auth-jwt';
import {
    TEST_AUDIENCE,
    TEST_ISSUER,
    createTestKeyPair,
    signTestToken,
    type TestKeyPair,
} from '@examio/auth-jwt/testing';

/**
 * admin-finance over a REAL gRPC hop to a fake finance server (real stateless
 * guards on both sides, same key pair). HTTP shapes stay what they were; an
 * unreachable finance is a 503 envelope.
 */
const calls: Array<{ method: string; req: unknown; actor?: string }> = [];
const seen = new Set<string>();
let mode: 'ok' | 'down' = 'ok';

@Controller()
@financeAdminV1.FinanceAdminServiceControllerMethods()
class FakeFinanceAdmin implements financeAdminV1.FinanceAdminServiceController {
    @RequirePermissions('finance:admin')
    adjustBalance(req: financeAdminV1.AdjustBalanceRequest, md: Metadata) {
        calls.push({ method: 'adjustBalance', req, actor: principalOfMetadata(md)?.kind === 'user' ? (principalOfMetadata(md) as { id: string }).id : undefined });
        if (mode === 'down') throw new RpcException({ code: status.UNAVAILABLE, message: 'finance down' });
        const again = seen.has(req.idempotencyKey);
        seen.add(req.idempotencyKey);
        if (req.userId === 'poor') throw new RpcException({ code: status.FAILED_PRECONDITION, message: 'INSUFFICIENT_CREDITS' });
        return { userId: req.userId, walletId: 'w1', previousBalance: 10, newBalance: 10 + req.amount, amount: req.amount, direction: req.direction, alreadyApplied: again };
    }

    @RequirePermissions('finance:admin')
    refundPayment(req: financeAdminV1.RefundPaymentRequest) {
        calls.push({ method: 'refundPayment', req });
        if (req.paymentId === 'done') throw new RpcException({ code: status.FAILED_PRECONDITION, message: 'PAYMENT_ALREADY_REFUNDED' });
        return { paymentId: req.paymentId, userId: 'user-1', amount: 30, previousStatus: 1, newStatus: 4, walletAdjusted: true, alreadyApplied: false };
    }

    @RequirePermissions('finance:admin')
    getUserFinance() {
        return { wallet: { id: 'w1', balance: 10 }, subscription: undefined };
    }

    @RequirePermissions('finance:admin')
    changeTier(req: financeAdminV1.ChangeTierRequest) {
        calls.push({ method: 'changeTier', req });
        return { userId: req.userId, previousTier: 0, newTier: req.tier, previousBillingCycle: '', newBillingCycle: 'monthly', isActive: req.tier > 0, alreadyApplied: false };
    }

    @RequirePermissions('finance:admin')
    listPayments() {
        return { payments: [], nextCursor: '' };
    }

    @RequirePermissions('finance:admin')
    listSubscriptions() {
        return { subscriptions: [], nextCursor: '' };
    }
}

describe('admin-finance (e2e, fake finance gRPC server)', () => {
    let app: INestApplication;
    let finance: TestGrpcServer;
    let keys: TestKeyPair;
    const audits: Array<{ action: string; adminId: string }> = [];
    const authLookups: string[] = [];

    const verifier = () =>
        createTokenVerifier({
            issuer: TEST_ISSUER,
            audiences: [TEST_AUDIENCE, 'admin', 'finance'],
            localJwks: { keys: [keys.publicJwk] },
        });
    const admin = async (sub = 'admin-1') => ({
        authorization: `Bearer ${await signTestToken(keys, { claims: { sub, roles: ['SYSTEM_ADMIN'] }, audience: 'examio' })}`,
    });
    const creditBody = { userId: 'user-1', amount: 5, direction: 'ADD', reason: 'goodwill credit' };

    beforeAll(async () => {
        // Proto paths resolve against examio-be/.
        process.chdir(join(__dirname, '..', '..', '..'));
        keys = await createTestKeyPair('admin-fin-k');
        const financeModule = await Test.createTestingModule({
            imports: [AuthJwtModule.forRoot({ serviceName: 'finance', verifier: { useFactory: verifier } })],
            controllers: [FakeFinanceAdmin],
        }).compile();
        finance = await startTestGrpcServer(financeModule, [PROTO_FILES.financeAdmin]);
        process.env.FINANCE_GRPC_URL = finance.url;

        const { AdminServiceModule } = await import('../src/admin-service.module');
        const prisma = {
            adminAudit: {
                create: jest.fn(async ({ data }: { data: { action: string; adminId: string } }) => {
                    audits.push({ action: data.action, adminId: data.adminId });
                    return { id: 'a1' };
                }),
            },
            $transaction: jest.fn(),
        };
        const moduleRef = await Test.createTestingModule({ imports: [AdminServiceModule] })
            .overrideProvider(PrismaService)
            .useValue(prisma)
            .overrideProvider(TOKEN_VERIFIER)
            .useValue(verifier())
            .overrideProvider(AuthUsersClient)
            .useValue({
                getUserAdminDetail: async (userId: string) => {
                    authLookups.push(userId);
                    if (userId === 'ghost') throw new HttpException({ statusCode: 404, code: 'NOT_FOUND' }, 404);
                    return { user: { id: userId } };
                },
            })
            .compile();
        app = moduleRef.createNestApplication();
        const { HttpErrorEnvelopeFilter } = await import('@examio/http');
        app.useGlobalFilters(new HttpErrorEnvelopeFilter());
        await app.init();
    });
    afterAll(async () => {
        await app?.close();
        await finance?.close();
        delete process.env.FINANCE_GRPC_URL;
    });
    beforeEach(() => {
        calls.length = 0;
        audits.length = 0;
        authLookups.length = 0;
        seen.clear();
        mode = 'ok';
    });

    it('POST /admin/finance/credit keeps its response shape; the actor is the token sub, never a body field', async () => {
        const res = await request(app.getHttpServer()).post('/admin/finance/credit').set(await admin('admin-7')).send(creditBody);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            success: true,
            data: { userId: 'user-1', walletId: 'w1', previousBalance: 10, newBalance: 15, amount: 5, direction: 'ADD', alreadyApplied: false },
        });
        expect(calls[0].actor).toBe('admin-7');
        expect(Object.keys(calls[0].req as object).some((k) => /actor|admin/i.test(k))).toBe(false);
        expect(audits).toEqual([{ action: 'admin.finance.credit', adminId: 'admin-7' }]);
    });

    it('a repeated Idempotency-Key reaches finance as the SAME key and is audited once', async () => {
        const send = async () =>
            request(app.getHttpServer()).post('/admin/finance/credit').set(await admin()).set('Idempotency-Key', 'dup-1').send(creditBody);
        const first = await send();
        const second = await send();
        expect([first.status, second.status]).toEqual([200, 200]);
        expect([first.body.data.alreadyApplied, second.body.data.alreadyApplied]).toEqual([false, true]);
        expect(calls.map((c) => (c.req as { idempotencyKey: string }).idempotencyKey)).toEqual(['dup-1', 'dup-1']);
        expect(audits).toHaveLength(1);
    });

    it('without the header each request gets its own key', async () => {
        for (let i = 0; i < 2; i++) await request(app.getHttpServer()).post('/admin/finance/credit').set(await admin()).send(creditBody);
        const keys2 = calls.map((c) => (c.req as { idempotencyKey: string }).idempotencyKey);
        expect(new Set(keys2).size).toBe(2);
        expect(keys2[0]).toMatch(/^admin:/);
    });

    it('POST /admin/finance/refund and /tier keep their shapes', async () => {
        const refund = await request(app.getHttpServer()).post('/admin/finance/refund').set(await admin()).send({ paymentId: 'pay-1', reason: 'duplicate charge' });
        expect(refund.body).toEqual({
            success: true,
            data: { paymentId: 'pay-1', userId: 'user-1', amount: 30, previousStatus: 1, newStatus: 4, walletAdjusted: true, alreadyApplied: false },
        });
        const tier = await request(app.getHttpServer()).post('/admin/finance/tier').set(await admin()).send({ userId: 'user-1', tier: 2, reason: 'promo upgrade' });
        expect(tier.body).toEqual({
            success: true,
            data: { userId: 'user-1', previousTier: 0, newTier: 2, previousBillingCycle: null, newBillingCycle: 'monthly', isActive: true, alreadyApplied: false },
        });
    });

    it('POST /admin/finance/tier for an unknown user is the historical 404 and never reaches finance', async () => {
        const res = await request(app.getHttpServer()).post('/admin/finance/tier').set(await admin()).send({ userId: 'ghost', tier: 2, reason: 'promo upgrade' });
        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ statusCode: 404, code: 'USER_NOT_FOUND', message: 'User not found' });
        expect(authLookups).toEqual(['ghost']);
        expect(calls).toHaveLength(0);
        expect(audits).toHaveLength(0);
    });

    it('historical error statuses survive the RPC hop (409 already refunded, 400 insufficient)', async () => {
        const refunded = await request(app.getHttpServer()).post('/admin/finance/refund').set(await admin()).send({ paymentId: 'done', reason: 'duplicate charge' });
        expect([refunded.status, refunded.body.message]).toEqual([409, 'Payment already refunded']);
        const poor = await request(app.getHttpServer()).post('/admin/finance/credit').set(await admin()).send({ ...creditBody, userId: 'poor', direction: 'SUBTRACT' });
        expect(poor.status).toBe(400);
    });

    it('finance UNAVAILABLE -> 503 envelope after the bounded keyed retries, and no audit row', async () => {
        mode = 'down';
        const res = await request(app.getHttpServer()).post('/admin/finance/credit').set(await admin()).send(creditBody);
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ statusCode: 503, code: 'UNAVAILABLE' });
        expect(audits).toHaveLength(0);
        expect(calls.length).toBe(3); // 1 try + 2 retries, same key
        expect(new Set(calls.map((c) => (c.req as { idempotencyKey: string }).idempotencyKey)).size).toBe(1);
    });

    it('a non-admin token never reaches finance', async () => {
        const res = await request(app.getHttpServer())
            .post('/admin/finance/credit')
            .set({ authorization: `Bearer ${await signTestToken(keys, { claims: { sub: 't', roles: ['TEACHER'] }, audience: 'examio' })}` })
            .send(creditBody);
        expect(res.status).toBe(403);
        expect(calls).toHaveLength(0);
    });

    it('a fractional amount is a 400 INVALID_AMOUNT and never reaches finance', async () => {
        const res = await request(app.getHttpServer()).post('/admin/finance/credit').set(await admin()).send({ ...creditBody, amount: 5.5 });
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 'INVALID_AMOUNT' });
        expect(calls).toHaveLength(0);
    });
});
