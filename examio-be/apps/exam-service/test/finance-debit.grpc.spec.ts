import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@examio/database';
import { GenerateIdService } from '@examio/common';
import { PROTO_FILES } from '@examio/contracts';
import { GrpcClientModule } from '@examio/grpc';
import { startTestGrpcServer, TestGrpcServer } from '@examio/grpc/testing';
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
        const financeModule = await Test.createTestingModule({
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
            providers: [FinanceClient, FinanceClientService],
        }).compile();
        await examModule.init();
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
            providers: [FinanceClient, FinanceClientService],
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
