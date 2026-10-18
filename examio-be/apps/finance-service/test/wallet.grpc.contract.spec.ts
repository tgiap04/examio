import { Metadata } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { lastValueFrom } from 'rxjs';
import { PrismaService } from '@examio/database';
import { GenerateIdService } from '@examio/common';
import { PROTO_FILES, subscriptionV1, walletV1 } from '@examio/contracts';
import { createTestGrpcClient, startTestGrpcServer, TestGrpcServer } from '@examio/grpc/testing';
import { WalletGrpcController } from '../src/modules/wallet/wallet.grpc.controller';
import { SubscriptionGrpcController } from '../src/modules/sepay/subscription.grpc.controller';
import { SubscriptionService } from '../src/modules/sepay/subscription.service';

const protos = [PROTO_FILES.wallet, PROTO_FILES.subscription];

describe('WalletService / SubscriptionService gRPC contract', () => {
    let server: TestGrpcServer;
    let wallet: walletV1.WalletServiceClient;
    let subscription: subscriptionV1.SubscriptionServiceClient;
    const prisma = {
        wallet: { findUnique: jest.fn(), create: jest.fn() },
    };
    const subscriptions = {
        getUserSubscriptionBenefits: jest.fn(),
    };

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [WalletGrpcController, SubscriptionGrpcController],
            providers: [
                { provide: PrismaService, useValue: prisma },
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

    it('GetWallet round-trips camelCase fields', async () => {
        prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', balance: 42 });
        const res = await lastValueFrom(wallet.getWallet({ userId: 'u1' }, new Metadata()));
        expect(res).toEqual({ walletId: 'w1', userId: 'u1', balance: 42 });
        expect(typeof res.balance).toBe('number');
        expect(prisma.wallet.findUnique).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    });

    it('CreateWallet returns walletId', async () => {
        prisma.wallet.create.mockResolvedValue({ id: 'w9' });
        const res = await lastValueFrom(
            wallet.createWallet({ userId: 'u9', initialBalance: 0 }, new Metadata())
        );
        expect(res).toMatchObject({ success: true, walletId: 'w9' });
    });

    it.each(['debit', 'credit'] as const)('%s is UNIMPLEMENTED until phase 10', async (m) => {
        await expect(
            lastValueFrom(
                wallet[m](
                    { userId: 'u1', amount: 5, reason: 'r', idempotencyKey: 'k1' },
                    new Metadata()
                )
            )
        ).rejects.toMatchObject({ code: 12 });
    });

    it('refund is UNIMPLEMENTED until phase 10', async () => {
        await expect(
            lastValueFrom(
                wallet.refund({ debitIdempotencyKey: 'k1', reason: 'r' }, new Metadata())
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
            subscription.getUserBenefits({ userId: 'u1' }, new Metadata())
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
