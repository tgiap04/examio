import { ForbiddenException } from '@nestjs/common';
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
import { FinanceClientService } from '../../apps/exam-service/src/modules/finance-client/finance-client.service';

/**
 * Real gRPC round trip exam -> finance over the generated contracts: the AI
 * generation debit path (FinanceClientService.deductCredits -> WalletService/Debit)
 * debits once per idempotency key and still fails closed.
 */
describe('exam -> finance debit over gRPC', () => {
    let server: TestGrpcServer;
    let service: FinanceClientService;
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
                FinanceClientService,
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
        service = examModule.get(FinanceClientService);
        consumer = examModule;
    });

    afterAll(async () => {
        await consumer.close();
        await server.close();
        delete process.env[FINANCE_GRPC_REGISTRATION.urlEnv];
    });

    beforeEach(() => jest.clearAllMocks());

    it('debits 5 credits and reports the new balance, keyed by the idempotency key', async () => {
        money.debit.mockResolvedValue(debited());

        const result = await service.deductCredits('u1', 5, 'quick upload', 'quick-upload:s1');

        expect(result).toMatchObject({ success: true, newBalance: 15 });
        expect(money.debit).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 'u1', amount: 5, reason: 'quick upload', idempotencyKey: 'quick-upload:s1' }),
            // exam calls with a service token: it never mints the welcome wallet (L1)
            { createWallet: false }
        );
    });

    it('a replay of the same key is reported as applied without a second charge', async () => {
        money.debit.mockResolvedValue({ ...debited(), alreadyApplied: true });
        await expect(service.deductCredits('u1', 5, 'quick upload', 'quick-upload:s1')).resolves.toMatchObject({
            newBalance: 15,
        });
    });

    it('blocks the operation when the balance is insufficient', async () => {
        money.debit.mockRejectedValue(new RpcException({ code: 9, message: 'INSUFFICIENT_CREDITS' }));
        await expect(service.deductCredits('u1', 5, 'quick upload', 'k')).rejects.toBeInstanceOf(
            ForbiddenException
        );
    });

    it('rejects a fractional amount before it reaches finance (no truncated debit)', async () => {
        await expect(service.deductCredits('u1', 5.5, 'x', 'k')).rejects.toMatchObject({ status: 400 });
        expect(money.debit).not.toHaveBeenCalled();
    });

    it('fails closed when finance-service is unreachable', async () => {
        // register() reads the env eagerly, so set it first.
        process.env.DEAD_FINANCE_URL = '127.0.0.1:1';
        const mod = await Test.createTestingModule({
            imports: [GrpcClientModule.register({ ...FINANCE_GRPC_REGISTRATION, urlEnv: 'DEAD_FINANCE_URL' })],
            providers: [
                FinanceClient,
                FinanceClientService,
                { provide: GRPC_METADATA_ATTACHER, useValue: { attach: async (m: Metadata) => m } },
            ],
        }).compile();
        await mod.init();
        try {
            await expect(mod.get(FinanceClientService).deductCredits('u1', 5, 'x', 'k')).rejects.toBeInstanceOf(
                ForbiddenException
            );
        } finally {
            await mod.close();
            delete process.env.DEAD_FINANCE_URL;
        }
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

    describe('caller user token (TEACHER lazy wallet)', () => {
        const userToken = (sub: string, roles: string[]) =>
            signTestToken(keys, { claims: { sub, roles } });

        it('a TEACHER token for self reaches finance with createWallet (welcome wallet minted there)', async () => {
            money.debit.mockResolvedValue(debited());
            const token = await userToken('u1', ['TEACHER']);

            const result = await service.deductCredits('u1', 5, 'quick upload', 'k-t', { userToken: token });

            expect(result).toMatchObject({ success: true, newBalance: 15 });
            expect(money.debit).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'u1', idempotencyKey: 'k-t' }),
                { createWallet: true }
            );
        });

        it('the service token alone never creates a wallet and a missing one gets a clear message', async () => {
            money.debit.mockRejectedValue(new RpcException({ code: 9, message: 'WALLET_NOT_FOUND' }));

            await expect(service.deductCredits('u1', 5, 'x', 'k-s')).rejects.toMatchObject({
                message: expect.stringContaining('Ví chưa được khởi tạo'),
            });
            expect(money.debit).toHaveBeenCalledWith(expect.anything(), { createWallet: false });
        });

        it('a token of another user is PERMISSION_DENIED and nothing is debited', async () => {
            const token = await userToken('someone-else', ['TEACHER']);

            await expect(
                service.deductCredits('u1', 5, 'x', 'k-o', { userToken: token })
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(money.debit).not.toHaveBeenCalled();
        });

        it('a STUDENT token has no wallet:use and is denied', async () => {
            const token = await userToken('u1', ['STUDENT']);

            await expect(
                service.deductCredits('u1', 5, 'x', 'k-st', { userToken: token })
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(money.debit).not.toHaveBeenCalled();
        });

        it('insufficient credits keeps its own message, distinct from a missing wallet', async () => {
            money.debit.mockRejectedValue(new RpcException({ code: 9, message: 'INSUFFICIENT_CREDITS' }));
            const token = await userToken('u1', ['TEACHER']);

            await expect(
                service.deductCredits('u1', 5, 'x', 'k-i', { userToken: token })
            ).rejects.toMatchObject({ message: expect.stringContaining('Không đủ tín dụng') });
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
        await expect(service.getUserBenefits('u1')).resolves.toEqual({
            tier: 3,
            tierName: 'VIP',
            filesPerMonth: -1,
            messagesPerMinute: -1,
            chatMessagesLimit: -1,
        });
    });
});
