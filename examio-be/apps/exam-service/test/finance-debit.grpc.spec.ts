import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@examio/database';
import { GenerateIdService } from '@examio/common';
import { PROTO_FILES } from '@examio/contracts';
import { GrpcClientModule } from '@examio/grpc';
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
import { WalletGrpcController } from '../../finance-service/src/modules/wallet/wallet.grpc.controller';
import { SubscriptionGrpcController } from '../../finance-service/src/modules/sepay/subscription.grpc.controller';
import { SubscriptionService } from '../../finance-service/src/modules/sepay/subscription.service';
import { FinanceClient, FINANCE_GRPC_REGISTRATION } from '../src/clients/finance.client';
import { FinanceClientService } from '../src/modules/finance-client/finance-client.service';

/**
 * Real gRPC round trip exam -> finance over the generated contracts: the AI
 * generation debit path (FinanceClientService.deductCredits -> UpdateBalance)
 * must still debit and still fail closed.
 */
describe('exam -> finance debit over gRPC', () => {
    let server: TestGrpcServer;
    let service: FinanceClientService;
    let consumer: { close(): Promise<void> };
    let keys: TestKeyPair;
    let rawWallet: walletV1.WalletServiceClient;

    const tx = {
        wallet: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
        walletTransaction: { create: jest.fn() },
    };
    const subscriptions = { getUserSubscriptionBenefits: jest.fn() };
    const prisma = {
        wallet: { findUnique: jest.fn() },
        $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };

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
                { provide: GenerateIdService, useValue: { generateId: () => 'txn-1' } },
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

    it('deducts 5 credits from a funded wallet', async () => {
        prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', balance: 20 });
        tx.wallet.updateMany.mockResolvedValue({ count: 1 });
        tx.wallet.findUniqueOrThrow.mockResolvedValue({ id: 'w1', balance: 15 });

        const result = await service.deductCredits('u1', 5, 'quick upload');

        expect(result).toMatchObject({ success: true, newBalance: 15 });
        expect(tx.wallet.updateMany).toHaveBeenCalledWith({
            where: { id: 'w1', balance: { gte: 5 } },
            data: { balance: { decrement: 5 } },
        });
        expect(tx.walletTransaction.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ walletId: 'w1', amount: 5, direction: 'SUBTRACT' }),
        });
    });

    it('blocks the operation when the balance is insufficient', async () => {
        prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', balance: 2 });
        tx.wallet.updateMany.mockResolvedValue({ count: 0 });
        await expect(service.deductCredits('u1', 5, 'quick upload')).rejects.toBeInstanceOf(
            ForbiddenException
        );
    });

    it('rejects a fractional amount before it reaches finance (no truncated debit)', async () => {
        await expect(service.deductCredits('u1', 5.5, 'x')).rejects.toMatchObject({ status: 400 });
        expect(prisma.wallet.findUnique).not.toHaveBeenCalled();
        expect(tx.wallet.updateMany).not.toHaveBeenCalled();
    });

    it('fails closed when finance-service is unreachable', async () => {
        // register() reads the env eagerly, so set it first.
        process.env.DEAD_FINANCE_URL = '127.0.0.1:1';
        const mod = await Test.createTestingModule({
            imports: [GrpcClientModule.register({ ...FINANCE_GRPC_REGISTRATION, urlEnv: 'DEAD_FINANCE_URL' })],
            providers: [
                FinanceClient,
                FinanceClientService,
                { provide: ServiceMetadata, useValue: { attach: async (m: Metadata) => m } },
            ],
        }).compile();
        await mod.init();
        try {
            await expect(mod.get(FinanceClientService).deductCredits('u1', 5, 'x')).rejects.toBeInstanceOf(
                ForbiddenException
            );
        } finally {
            await mod.close();
            delete process.env.DEAD_FINANCE_URL;
        }
    });

    describe('UpdateBalance is service-only (guard on the real gRPC server)', () => {
        const req = { userId: 'u1', amount: 5, transactionType: 'SUBTRACT', description: 'x' };

        it('a call without metadata is UNAUTHENTICATED', async () => {
            await expect(lastValueFrom(rawWallet.updateBalance(req, new Metadata()))).rejects.toMatchObject({ code: 16 });
            expect(prisma.wallet.findUnique).not.toHaveBeenCalled();
        });

        it('a user token (even an admin) is PERMISSION_DENIED', async () => {
            const md = new Metadata();
            md.set('authorization', `Bearer ${await signTestToken(keys, { claims: { roles: ['SYSTEM_ADMIN'] }, audience: 'finance' })}`);
            await expect(lastValueFrom(rawWallet.updateBalance(req, md))).rejects.toMatchObject({ code: 7 });
        });

        it('svc:auth is PERMISSION_DENIED, only svc:exam passes', async () => {
            const md = new Metadata();
            md.set('authorization', `Bearer ${await signTestToken(keys, { claims: serviceClaims('auth'), audience: 'finance' })}`);
            await expect(lastValueFrom(rawWallet.updateBalance(req, md))).rejects.toMatchObject({ code: 7 });
            expect(tx.wallet.updateMany).not.toHaveBeenCalled();
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
