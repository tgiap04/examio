import { Metadata } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { lastValueFrom } from 'rxjs';
import { PrismaService } from '@examio/database';
import { RedisService } from '@examio/redis';
import { GenerateIdService } from '@examio/common';
import { PROTO_FILES, subscriptionV1, walletV1 } from '@examio/contracts';
import { createTestGrpcClient, startTestGrpcServer, TestGrpcServer } from '@examio/grpc/testing';
import { WalletGrpcController } from '../src/modules/wallet/wallet.grpc.controller';
import { SubscriptionGrpcController } from '../src/modules/sepay/subscription.grpc.controller';
import { SubscriptionService } from '../src/modules/sepay/subscription.service';
import { AuthJwtModule, createTokenVerifier } from '@examio/auth-jwt';
import {
    TEST_AUDIENCE,
    TEST_ISSUER,
    createTestKeyPair,
    serviceClaims,
    signTestToken,
    type TestKeyPair,
} from '@examio/auth-jwt/testing';

const protos = [PROTO_FILES.wallet, PROTO_FILES.subscription];

describe('WalletService / SubscriptionService gRPC contract (behind the real guards)', () => {
    let keys: TestKeyPair;
    let server: TestGrpcServer;
    let wallet: walletV1.WalletServiceClient;
    let subscription: subscriptionV1.SubscriptionServiceClient;
    const prisma = {
        wallet: { findUnique: jest.fn(), create: jest.fn() },
    };
    const subscriptions = {
        getUserSubscriptionBenefits: jest.fn(),
    };

    const md = async (claims: Record<string, unknown>) => {
        const m = new Metadata();
        m.set('authorization', `Bearer ${await signTestToken(keys, { claims, audience: 'finance' })}`);
        return m;
    };
    const student = (sub: string) => md({ sub, roles: ['STUDENT'] });
    const teacher = (sub: string) => md({ sub, roles: ['TEACHER'] });
    const svc = (name: string) => md(serviceClaims(name));

    beforeAll(async () => {
        keys = await createTestKeyPair('fin-contract');
        const moduleRef = await Test.createTestingModule({
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
                { provide: GenerateIdService, useValue: { generateId: () => 'id-1' } },
                { provide: SubscriptionService, useValue: subscriptions },
            ],
        }).compile();
        server = await startTestGrpcServer(moduleRef, protos);
        const client = createTestGrpcClient(server.url, protos);
        wallet = client.getService<walletV1.WalletServiceClient>(walletV1.WALLET_SERVICE_NAME);
        subscription = client.getService<subscriptionV1.SubscriptionServiceClient>(
            subscriptionV1.SUBSCRIPTION_SERVICE_NAME
        );
    });

    afterAll(() => server.close());

    beforeEach(() => jest.clearAllMocks());

    it('GetWallet round-trips camelCase fields (own wallet)', async () => {
        prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', balance: 42 });
        const res = await lastValueFrom(wallet.getWallet({ userId: 'u1' }, await teacher('u1')));
        expect(res).toEqual({ walletId: 'w1', userId: 'u1', balance: 42 });
        expect(typeof res.balance).toBe('number');
        expect(prisma.wallet.findUnique).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    });

    describe('IDOR: GetWallet / GetUserBenefits name a user in the BODY', () => {
        it('a STUDENT token reading ANOTHER user\'s wallet is PERMISSION_DENIED and never queries', async () => {
            prisma.wallet.findUnique.mockResolvedValue({ id: 'w2', userId: 'victim', balance: 99 });
            await expect(
                lastValueFrom(wallet.getWallet({ userId: 'victim' }, await student('attacker')))
            ).rejects.toMatchObject({ code: 7 });
            expect(prisma.wallet.findUnique).not.toHaveBeenCalled();
        });

        it('a TEACHER token reading another user\'s wallet is PERMISSION_DENIED too', async () => {
            await expect(
                lastValueFrom(wallet.getWallet({ userId: 'victim' }, await teacher('t1')))
            ).rejects.toMatchObject({ code: 7 });
        });

        it('an empty user_id never matches a user principal', async () => {
            await expect(
                lastValueFrom(wallet.getWallet({ userId: '' }, await student('attacker')))
            ).rejects.toMatchObject({ code: 7 });
        });

        it('a STUDENT reading their OWN wallet is allowed', async () => {
            prisma.wallet.findUnique.mockResolvedValue({ id: 'w3', userId: 'me', balance: 0 });
            const res = await lastValueFrom(wallet.getWallet({ userId: 'me' }, await student('me')));
            expect(res).toMatchObject({ userId: 'me' });
        });

        it.each(['exam', 'admin', 'auth'])('an allowlisted service (svc:%s) may read any wallet', async (name) => {
            prisma.wallet.findUnique.mockResolvedValue({ id: 'w2', userId: 'victim', balance: 7 });
            const res = await lastValueFrom(wallet.getWallet({ userId: 'victim' }, await svc(name)));
            expect(res.balance).toBe(7);
        });

        it('no metadata is UNAUTHENTICATED', async () => {
            await expect(lastValueFrom(wallet.getWallet({ userId: 'u1' }, new Metadata()))).rejects.toMatchObject({ code: 16 });
        });

        it('GetUserBenefits: another user\'s is PERMISSION_DENIED, own and service are allowed', async () => {
            subscriptions.getUserSubscriptionBenefits.mockResolvedValue({
                name: 'Basic', nameVi: 'Basic', filesPerMonth: 1, messagesPerMinute: 1, chatMessagesLimit: 1,
            });
            await expect(
                lastValueFrom(subscription.getUserBenefits({ userId: 'victim' }, await student('attacker')))
            ).rejects.toMatchObject({ code: 7 });
            expect(subscriptions.getUserSubscriptionBenefits).not.toHaveBeenCalled();
            await expect(
                lastValueFrom(subscription.getUserBenefits({ userId: 'me' }, await student('me')))
            ).resolves.toMatchObject({ tier: 1 });
            await expect(
                lastValueFrom(subscription.getUserBenefits({ userId: 'victim' }, await svc('exam')))
            ).resolves.toMatchObject({ tier: 1 });
        });
    });

    it('CreateWallet returns walletId (svc:auth only)', async () => {
        prisma.wallet.create.mockResolvedValue({ id: 'w9' });
        await expect(
            lastValueFrom(wallet.createWallet({ userId: 'u9', initialBalance: 0 }, await student('u9')))
        ).rejects.toMatchObject({ code: 7 });
        const res = await lastValueFrom(
            wallet.createWallet({ userId: 'u9', initialBalance: 0 }, await svc('auth'))
        );
        expect(res).toMatchObject({ success: true, walletId: 'w9' });
    });

    it.each(['debit', 'credit'] as const)('%s is UNIMPLEMENTED until phase 10', async (m) => {
        await expect(
            lastValueFrom(
                wallet[m](
                    { userId: 'u1', amount: 5, reason: 'r', idempotencyKey: 'k1' },
                    await svc('exam')
                )
            )
        ).rejects.toMatchObject({ code: 12 });
    });

    it('refund is UNIMPLEMENTED until phase 10', async () => {
        await expect(
            lastValueFrom(
                wallet.refund({ debitIdempotencyKey: 'k1', reason: 'r' }, await svc('exam'))
            )
        ).rejects.toMatchObject({ code: 12 });
    });

    it('GetUserBenefits maps benefits to camelCase fields', async () => {
        subscriptions.getUserSubscriptionBenefits.mockResolvedValue({
            name: 'Basic',
            nameVi: 'Cơ bản',
            filesPerMonth: 10,
            messagesPerMinute: -1,
            chatMessagesLimit: 100,
        });
        const res = await lastValueFrom(
            subscription.getUserBenefits({ userId: 'u1' }, await svc('exam'))
        );
        expect(res).toEqual({
            tier: 1,
            tierName: 'Cơ bản',
            filesPerMonth: 10,
            messagesPerMinute: -1,
            chatMessagesLimit: 100,
        });
    });
});
