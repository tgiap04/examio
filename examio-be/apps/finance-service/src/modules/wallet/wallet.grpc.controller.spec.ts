import { Metadata, status } from '@grpc/grpc-js';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@examio/database';
import { RedisService } from '@examio/redis';
import { GenerateIdService } from '@examio/common';
import { WalletGrpcController } from './wallet.grpc.controller';
import { WalletMoneyService } from './wallet-money.service';

describe('WalletGrpcController', () => {
    let controller: WalletGrpcController;
    const money = { debit: jest.fn(), credit: jest.fn(), refund: jest.fn() };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [WalletGrpcController],
            providers: [
                { provide: RedisService, useValue: { del: jest.fn(), delPattern: jest.fn() } },
                { provide: PrismaService, useValue: { wallet: { findUnique: jest.fn() } } },
                { provide: GenerateIdService, useValue: { generateId: () => 'id-1' } },
                { provide: WalletMoneyService, useValue: money },
            ],
        }).compile();
        controller = module.get(WalletGrpcController);
    });
    afterEach(() => jest.clearAllMocks());

    describe('CreateWallet - Input Validation', () => {
        it.each([1.5, -1, NaN])('should reject initialBalance %p', async (initialBalance) => {
            const result = await controller.createWallet({ userId: 'u', initialBalance });
            expect(result.success).toBe(false);
            expect(result.message).toContain('non-negative integer');
        });
    });

    describe('Debit', () => {
        it('without a verified principal is PERMISSION_DENIED and moves no money', async () => {
            await expect(
                controller.debit(
                    { userId: 'u1', amount: 5, reason: 'r', idempotencyKey: 'k' },
                    new Metadata()
                )
            ).rejects.toMatchObject({ error: { code: status.PERMISSION_DENIED } });
            expect(money.debit).not.toHaveBeenCalled();
        });
    });
});
