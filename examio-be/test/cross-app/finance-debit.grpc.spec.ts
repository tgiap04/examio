import { Test } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../apps/finance-service/src/prisma';
import { RedisService } from '@examio/redis';
import { GenerateIdService } from '@examio/common';
import { PROTO_FILES } from '@examio/contracts';
import { FINANCE_GRPC_REGISTRATION, FinanceClient, GRPC_METADATA_ATTACHER, GrpcClientModule } from '@examio/grpc';
import { createTestGrpcClient, startTestGrpcServer, TestGrpcServer } from '@examio/grpc/testing';
import { lastValueFrom } from 'rxjs';
import { Metadata } from '@grpc/grpc-js';
import { PROTO_FILES as PF, walletV1 } from '@examio/contracts';
import {
    AuthJwtModule,
    ServiceMetadata,
    ServiceTokenClient,
    createTokenVerifier,
} from '@examio/auth-jwt';
import {
    TEST_AUDIENCE,
    TEST_ISSUER,
    createTestKeyPair,
    serviceClaims,
    signTestToken,
    type TestKeyPair,
} from '@examio/auth-jwt/testing';
import { WalletGrpcController } from '../../apps/finance-service/src/modules/wallet/wallet.grpc.controller';
import { SubscriptionGrpcController } from '../../apps/finance-service/src/modules/sepay/subscription.grpc.controller';
import { SubscriptionService } from '../../apps/finance-service/src/modules/sepay/subscription.service';
import { WalletMoneyService } from '../../apps/finance-service/src/modules/wallet/wallet-money.service';
import { GenerationChargeService } from '../../apps/exam-service/src/modules/ai/generation-charge.service';
import { buildMetadata } from '@examio/grpc';

/**
 * Real gRPC round trip exam -> finance over the generated contracts, through real finance guards: the AI
 * generation charge (GenerationChargeService.debit -> WalletService/Debit as the user, .refund ->
 * WalletService/Refund as svc:exam) moves money once per idempotency key and still fails closed.
 */
describe('exam -> finance debit over gRPC', () => {
    let server: TestGrpcServer;
    let service: GenerationChargeService;
    let finance: FinanceClient;
    let consumer: { close(): Promise<void> };
    let keys: TestKeyPair;
    let rawWallet: walletV1.WalletServiceClient;

    const money = { debit: jest.fn(), credit: jest.fn(), refund: jest.fn() };
    const subscriptions = { getUserSubscriptionBenefits: jest.fn() };
    const prisma = { wallet: { findUnique: jest.fn() } };
    const debited = (over = {}) => ({
        alreadyApplied: false,
        transaction: {
            id: 't1', walletId: 'w1', amount: 5, direction: 'SUBTRACT', description: 'quick upload',
            idempotencyKey: 'k1', balanceAfter: 15, createdAt: new Date(1_760_000_000_000), ...over,
        },
    });

    beforeAll(async () => {
        keys = await createTestKeyPair('k1');
        const financeModule = await Test.createTestingModule({
            imports: [
                AuthJwtModule.forRoot({
                    serviceName: 'finance',
                    verifier: {
                        useFactory: () =>
                            createTokenVerifier({
                                issuer: TEST_ISSUER,
                                audiences: [TEST_AUDIENCE, 'finance'],
                                localJwks: { keys: [keys.publicJwk] },
                            }),
                    },
                }),
            ],
            controllers: [WalletGrpcController, SubscriptionGrpcController],
            providers: [
                { provide: PrismaService, useValue: prisma },
                { provide: RedisService, useValue: { del: jest.fn(), delPattern: jest.fn() } },
                { provide: GenerateIdService, useValue: { generateId: () => 'txn-1' } },
                { provide: WalletMoneyService, useValue: money },
                { provide: SubscriptionService, useValue: subscriptions },
            ],
        }).compile();
        server = await startTestGrpcServer(financeModule, [PROTO_FILES.wallet, PROTO_FILES.subscription]);

        process.env[FINANCE_GRPC_REGISTRATION.urlEnv] = server.url;
        const examModule = await Test.createTestingModule({
            imports: [GrpcClientModule.register(FINANCE_GRPC_REGISTRATION)],
            providers: [
                FinanceClient,
                { provide: GRPC_METADATA_ATTACHER, useExisting: ServiceMetadata },
                {
                    provide: ServiceMetadata,
                    useFactory: () =>
                        new ServiceMetadata(
                            new ServiceTokenClient({
                                fetch: async (audience) => ({
                                    token: await signTestToken(keys, {
                                        claims: serviceClaims('exam'),
                                        audience,
                                    }),
                                    expiresAt: Date.now() + 300_000,
                                }),
                            })
                        ),
                },
            ],
        }).compile();
        await examModule.init();
        rawWallet = createTestGrpcClient(server.url, [PF.wallet, PF.subscription]).getService<walletV1.WalletServiceClient>(
            walletV1.WALLET_SERVICE_NAME
        );
        finance = examModule.get(FinanceClient);
        // Only the money side is under test: the job row bookkeeping is a stub.
        service = new GenerationChargeService(finance, { markRefunded: jest.fn() } as never, {} as never);
        consumer = examModule;
    });

    afterAll(async () => {
        await consumer.close();
        await server.close();
        delete process.env[FINANCE_GRPC_REGISTRATION.urlEnv];
    });

    beforeEach(() => jest.clearAllMocks());

    const job = (over = {}) => ({
        id: 'j1',
        userId: 'u1',
        chargeKey: 'gen:j1',
        chargedAmount: 5,
        updatedAt: new Date(),
        ...over,
    });
    const userToken = (sub: string, roles: string[]) => signTestToken(keys, { claims: { sub, roles } });

    describe('Debit as the caller (TEACHER lazy wallet)', () => {
        it('a TEACHER token for self reaches finance with createWallet, keyed by gen:<jobId>, and reports the new balance', async () => {
            money.debit.mockResolvedValue(debited());

            const outcome = await service.debit(job(), 'Generate', await userToken('u1', ['TEACHER']));

            expect(outcome).toEqual({ kind: 'charged', newBalance: 15 });
            expect(money.debit).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'u1', amount: 5, reason: 'Generate', idempotencyKey: 'gen:j1' }),
                { createWallet: true }
            );
        });

        it('a replay of the same key is reported as charged without a second debit', async () => {
            money.debit.mockResolvedValue({ ...debited(), alreadyApplied: true });
            await expect(service.debit(job(), 'x', await userToken('u1', ['TEACHER']))).resolves.toEqual({ kind: 'charged', newBalance: 15 });
        });

        it('insufficient credits is a definitive refusal with its own message', async () => {
            money.debit.mockRejectedValue(new RpcException({ code: 9, message: 'INSUFFICIENT_CREDITS' }));

            const outcome = await service.debit(job(), 'x', await userToken('u1', ['TEACHER']));

            expect(outcome).toMatchObject({ kind: 'refused', error: { status: 403 } });
            expect(JSON.stringify((outcome as { error: { getResponse(): unknown } }).error.getResponse())).toContain('Không đủ tín dụng');
        });

        it('a missing wallet is a refusal with a clear message, distinct from insufficient credits', async () => {
            money.debit.mockRejectedValue(new RpcException({ code: 9, message: 'WALLET_NOT_FOUND' }));

            const outcome = await service.debit(job(), 'x', await userToken('u1', ['TEACHER']));

            expect(outcome).toMatchObject({ kind: 'refused' });
            expect(JSON.stringify((outcome as { error: { getResponse(): unknown } }).error.getResponse())).toContain('Ví chưa được khởi tạo');
        });

        it('a token of another user is PERMISSION_DENIED: a definitive refusal (403), nothing is debited, never a charge', async () => {
            const outcome = await service.debit(job(), 'x', await userToken('someone-else', ['TEACHER']));

            expect(outcome.kind).toBe('refused');
            expect((outcome as { error: { getStatus(): number } }).error.getStatus()).toBe(403);
            expect(JSON.stringify((outcome as { error: { getResponse(): unknown } }).error.getResponse())).toContain('PERMISSION_DENIED');
            expect(money.debit).not.toHaveBeenCalled();
        });

        it('a STUDENT token has no wallet:use: a definitive refusal, nothing debited', async () => {
            const outcome = await service.debit(job(), 'x', await userToken('u1', ['STUDENT']));

            expect(outcome.kind).toBe('refused');
            expect(money.debit).not.toHaveBeenCalled();
        });

        it('a fractional amount never reaches finance (no truncated debit)', async () => {
            const outcome = await service.debit(job({ chargedAmount: 5.5 }), 'x', await userToken('u1', ['TEACHER']));

            expect(outcome.kind).toBe('unknown');
            expect(money.debit).not.toHaveBeenCalled();
        });

        it('an unreachable finance-service is an unknown outcome (the reaper settles the job), not a refusal', async () => {
            // register() reads the env eagerly, so set it first.
            process.env.DEAD_FINANCE_URL = '127.0.0.1:1';
            const mod = await Test.createTestingModule({
                imports: [GrpcClientModule.register({ ...FINANCE_GRPC_REGISTRATION, urlEnv: 'DEAD_FINANCE_URL' })],
                providers: [FinanceClient, { provide: GRPC_METADATA_ATTACHER, useValue: { attach: async (m: Metadata) => m } }],
            }).compile();
            await mod.init();
            try {
                const dead = new GenerationChargeService(mod.get(FinanceClient), {} as never, {} as never);
                await expect(dead.debit(job(), 'x', 'token')).resolves.toMatchObject({ kind: 'unknown' });
            } finally {
                await mod.close();
                delete process.env.DEAD_FINANCE_URL;
            }
        });
    });

    describe('Refund as svc:exam', () => {
        it('reverses the debit by its key through the real service-only guard and settles the job', async () => {
            money.refund.mockResolvedValue({ alreadyApplied: false, transaction: debited({ direction: 'ADD' }).transaction });
            const markRefunded = jest.fn();
            const charge = new GenerationChargeService(finance, { markRefunded } as never, {} as never);

            await expect(charge.refund(job())).resolves.toBe(true);

            expect(money.refund).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', debitIdempotencyKey: 'gen:j1' }));
            expect(markRefunded).toHaveBeenCalledWith(expect.anything(), 'j1');
        });

        it('NOT_FOUND (no debit under the key) stays open until the debit window passed, then settles', async () => {
            money.refund.mockRejectedValue(new RpcException({ code: 5, message: 'DEBIT_NOT_FOUND' }));
            const markRefunded = jest.fn();
            const charge = new GenerationChargeService(finance, { markRefunded } as never, {} as never);

            await expect(charge.refund(job())).resolves.toBe(false);
            expect(markRefunded).not.toHaveBeenCalled();
            await expect(charge.refund(job(), undefined, true)).resolves.toBe(true);
            expect(markRefunded).toHaveBeenCalledTimes(1);
        });

        it('a finance outage leaves the refund open for the sweeper instead of failing the caller', async () => {
            money.refund.mockRejectedValue(new RpcException({ code: 13, message: 'boom' }));
            const markRefunded = jest.fn();
            const charge = new GenerationChargeService(finance, { markRefunded } as never, {} as never);

            await expect(charge.refund(job())).resolves.toBe(false);
            expect(markRefunded).not.toHaveBeenCalled();
        });

        it('a free job (amount 0) needs no finance call', async () => {
            const charge = new GenerationChargeService(finance, { markRefunded: jest.fn() } as never, {} as never);
            await expect(charge.refund(job({ chargedAmount: 0 }))).resolves.toBe(true);
            expect(money.refund).not.toHaveBeenCalled();
        });
    });

    describe('Debit guard on the real gRPC server', () => {
        const req = { userId: 'u1', amount: 5, reason: 'x', idempotencyKey: 'k' };

        it('a call without metadata is UNAUTHENTICATED', async () => {
            await expect(lastValueFrom(rawWallet.debit(req, new Metadata()))).rejects.toMatchObject({ code: 16 });
            expect(money.debit).not.toHaveBeenCalled();
        });

        it('another user token (even an admin) is PERMISSION_DENIED', async () => {
            const md = new Metadata();
            md.set('authorization', `Bearer ${await signTestToken(keys, { claims: { sub: 'x', roles: ['SYSTEM_ADMIN'] }, audience: 'finance' })}`);
            await expect(lastValueFrom(rawWallet.debit(req, md))).rejects.toMatchObject({ code: 7 });
        });

        it('svc:auth is PERMISSION_DENIED, only exam/content/document pass', async () => {
            const md = new Metadata();
            md.set('authorization', `Bearer ${await signTestToken(keys, { claims: serviceClaims('auth'), audience: 'finance' })}`);
            await expect(lastValueFrom(rawWallet.debit(req, md))).rejects.toMatchObject({ code: 7 });
            expect(money.debit).not.toHaveBeenCalled();
        });
    });

    it('reads subscription benefits as camelCase fields', async () => {
        subscriptions.getUserSubscriptionBenefits.mockResolvedValue({
            name: 'VIP',
            nameVi: 'VIP',
            filesPerMonth: -1,
            messagesPerMinute: -1,
            chatMessagesLimit: -1,
        });
        await expect(finance.getUserBenefits('u1', buildMetadata())).resolves.toEqual({
            tier: 3,
            tierName: 'VIP',
            filesPerMonth: -1,
            messagesPerMinute: -1,
            chatMessagesLimit: -1,
        });
    });
});
