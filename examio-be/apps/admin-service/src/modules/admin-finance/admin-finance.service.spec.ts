import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GenerateIdService } from '@examio/common';
import { PrismaService } from '@examio/database';
import { RedisService } from '@examio/redis';

import { AuditWriterService } from '../../common/audit-writer.service';
import { AdminFinanceService } from './admin-finance.service';

describe('AdminFinanceService.refund', () => {
    let service: AdminFinanceService;
    let prisma: { $transaction: jest.Mock };
    let auditWriter: { write: jest.Mock };
    let generateId: GenerateIdService;

    const adminCtx = {
        adminId: 'admin-1',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
    };

    beforeEach(async () => {
        prisma = { $transaction: jest.fn() };
        auditWriter = { write: jest.fn().mockResolvedValue(undefined) };
        generateId = new GenerateIdService();

        const moduleRef: TestingModule = await Test.createTestingModule({
            providers: [
                AdminFinanceService,
                { provide: PrismaService, useValue: prisma },
                { provide: RedisService, useValue: { del: jest.fn(), delPattern: jest.fn() } },
                { provide: AuditWriterService, useValue: auditWriter },
                { provide: GenerateIdService, useValue: generateId },
            ],
        }).compile();

        service = moduleRef.get(AdminFinanceService);
    });

    /**
     * Build a fake transaction client. prisma.$transaction(cb, opts) will
     * invoke `cb(txClient)` and forward whatever the callback resolves to.
     */
    function buildTxClient(overrides: Record<string, any> = {}) {
        const tx = {
            payment: {
                findUnique: jest.fn(),
                update: jest.fn().mockResolvedValue({}),
            },
            wallet: {
                findUnique: jest.fn(),
                update: jest.fn().mockResolvedValue({}),
            },
            walletTransaction: {
                create: jest.fn().mockResolvedValue({}),
            },
            adminAudit: {
                create: jest.fn().mockResolvedValue({}),
            },
            ...overrides,
        };
        prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
        return tx;
    }

    it('refunds a paid credits payment, reverses wallet and writes audit', async () => {
        const tx = buildTxClient();
        tx.payment.findUnique.mockResolvedValue({
            id: 'pay-1',
            userId: 'user-1',
            amount: 100,
            status: 1, // paid
            paymentType: 'credits',
        });
        tx.wallet.findUnique.mockResolvedValue({
            id: 'wallet-1',
            userId: 'user-1',
            balance: 250,
        });

        const result = await service.refund(
            { paymentId: 'pay-1', reason: 'duplicate charge refund' },
            adminCtx
        );

        expect(result).toEqual({
            paymentId: 'pay-1',
            userId: 'user-1',
            amount: 100,
            previousStatus: 1,
            newStatus: 4,
            walletAdjusted: true,
        });
        expect(tx.payment.update).toHaveBeenCalledWith({
            where: { id: 'pay-1' },
            data: { status: 4 },
        });
        expect(tx.wallet.update).toHaveBeenCalledWith({
            where: { id: 'wallet-1' },
            data: { balance: { decrement: 100 } },
        });
        expect(tx.walletTransaction.create).toHaveBeenCalledTimes(1);
        const txCreateArg = tx.walletTransaction.create.mock.calls[0][0];
        expect(txCreateArg.data).toMatchObject({
            walletId: 'wallet-1',
            amount: 100,
            type: 2,
            direction: 'SUBTRACT',
        });
        expect(auditWriter.write).toHaveBeenCalledTimes(1);
        const auditArg = auditWriter.write.mock.calls[0][0];
        expect(auditArg.action).toBe('admin.finance.refund');
        expect(auditArg.payload).toMatchObject({
            paymentId: 'pay-1',
            previousStatus: 1,
            newStatus: 4,
            walletAdjusted: true,
        });
        expect(auditWriter.write.mock.calls[0][1]).toEqual({ tx });
    });

    it('throws ConflictException when payment is already refunded', async () => {
        const tx = buildTxClient();
        tx.payment.findUnique.mockResolvedValue({
            id: 'pay-1',
            userId: 'user-1',
            amount: 100,
            status: 4, // already refunded
            paymentType: 'credits',
        });

        await expect(
            service.refund(
                { paymentId: 'pay-1', reason: 'duplicate refund attempt' },
                adminCtx
            )
        ).rejects.toBeInstanceOf(ConflictException);

        expect(tx.payment.update).not.toHaveBeenCalled();
        expect(tx.wallet.update).not.toHaveBeenCalled();
        expect(tx.walletTransaction.create).not.toHaveBeenCalled();
        expect(auditWriter.write).not.toHaveBeenCalled();
    });

    it('throws ConflictException when payment is not in paid status', async () => {
        const tx = buildTxClient();
        tx.payment.findUnique.mockResolvedValue({
            id: 'pay-1',
            userId: 'user-1',
            amount: 100,
            status: 0, // unpaid
            paymentType: 'credits',
        });

        await expect(
            service.refund(
                { paymentId: 'pay-1', reason: 'refund of an unpaid record' },
                adminCtx
            )
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException when payment does not exist', async () => {
        const tx = buildTxClient();
        tx.payment.findUnique.mockResolvedValue(null);

        await expect(
            service.refund(
                { paymentId: 'missing', reason: 'refund missing payment id' },
                adminCtx
            )
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not touch wallet for a subscription payment but still audits', async () => {
        const tx = buildTxClient();
        tx.payment.findUnique.mockResolvedValue({
            id: 'pay-sub',
            userId: 'user-2',
            amount: 99,
            status: 1,
            paymentType: 'subscription',
        });

        const result = await service.refund(
            {
                paymentId: 'pay-sub',
                reason: 'subscription refund, wallet untouched',
            },
            adminCtx
        );

        expect(result.walletAdjusted).toBe(false);
        expect(tx.payment.update).toHaveBeenCalledWith({
            where: { id: 'pay-sub' },
            data: { status: 4 },
        });
        expect(tx.wallet.findUnique).not.toHaveBeenCalled();
        expect(tx.wallet.update).not.toHaveBeenCalled();
        expect(tx.walletTransaction.create).not.toHaveBeenCalled();
        expect(auditWriter.write).toHaveBeenCalledTimes(1);
    });
});
