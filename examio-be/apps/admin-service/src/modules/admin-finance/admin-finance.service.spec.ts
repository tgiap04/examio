import { HttpException } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { AdminFinanceService } from './admin-finance.service';

const ctx = { adminId: 'admin-1', ipAddress: '127.0.0.1', userAgent: 'jest' };
const md = new Metadata();

function setup() {
    const finance = {
        refundPayment: jest.fn(),
        adjustBalance: jest.fn(),
        changeTier: jest.fn(),
    };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminFinanceService(finance as never, audit as never);
    return { service, finance, audit };
}
const legacy = (code: string, statusCode: number) =>
    new HttpException({ statusCode, code, message: code }, statusCode);

describe('AdminFinanceService.refund', () => {
    const refunded = {
        paymentId: 'pay-1', userId: 'user-1', amount: 100, previousStatus: 1, newStatus: 4,
        walletAdjusted: true, alreadyApplied: false,
    };

    it('forwards the admin metadata + key, sends NO actor, keeps the response shape, audits once', async () => {
        const { service, finance, audit } = setup();
        finance.refundPayment.mockResolvedValue(refunded);
        const out = await service.refund({ paymentId: 'pay-1', reason: 'duplicate charge' }, ctx, md, 'key-1');
        expect(out).toEqual({
            paymentId: 'pay-1', userId: 'user-1', amount: 100, previousStatus: 1, newStatus: 4, walletAdjusted: true, alreadyApplied: false,
        });
        expect(finance.refundPayment).toHaveBeenCalledWith(
            { paymentId: 'pay-1', reason: 'duplicate charge', idempotencyKey: 'key-1' },
            md
        );
        expect(audit.write).toHaveBeenCalledWith(
            expect.objectContaining({ adminId: 'admin-1', action: 'admin.finance.refund', targetId: 'user-1' })
        );
    });

    it('a replayed key is not audited twice', async () => {
        const { service, finance, audit } = setup();
        finance.refundPayment.mockResolvedValue({ ...refunded, alreadyApplied: true });
        const out = await service.refund({ paymentId: 'pay-1', reason: 'duplicate charge' }, ctx, md, 'key-1');
        expect(audit.write).not.toHaveBeenCalled();
        expect(out.alreadyApplied).toBe(true);
    });

    it.each([
        ['PAYMENT_ALREADY_REFUNDED', 422, 409, 'Payment already refunded'],
        ['PAYMENT_NOT_PAID', 422, 409, 'Payment is not in paid status — cannot refund'],
        ['PAYMENT_NOT_FOUND', 404, 404, 'Payment not found'],
    ])('maps %s back to its historical HTTP %i -> %i', async (code, _from, to, message) => {
        const { service, finance, audit } = setup();
        finance.refundPayment.mockRejectedValue(legacy(code, _from));
        const err = await service.refund({ paymentId: 'p', reason: 'duplicate charge' }, ctx, md, 'k').catch((e) => e);
        expect(err.getStatus()).toBe(to);
        expect(err.getResponse()).toMatchObject({ code, message });
        expect(audit.write).not.toHaveBeenCalled();
    });

    it('maps IDEMPOTENCY_KEY_REUSED to a 409 with a clear message', async () => {
        const { service, finance } = setup();
        finance.refundPayment.mockRejectedValue(legacy('IDEMPOTENCY_KEY_REUSED', 422));
        const err = await service.refund({ paymentId: 'p', reason: 'duplicate charge' }, ctx, md, 'k').catch((e) => e);
        expect(err.getStatus()).toBe(409);
        expect(err.getResponse()).toMatchObject({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: expect.stringContaining('Idempotency-Key'),
        });
    });

    it('an audit failure after the committed write is best-effort: the result is still returned', async () => {
        const { service, finance, audit } = setup();
        finance.refundPayment.mockResolvedValue(refunded);
        audit.write.mockRejectedValue(new Error('db down'));
        await expect(
            service.refund({ paymentId: 'pay-1', reason: 'duplicate charge' }, ctx, md, 'k')
        ).resolves.toMatchObject({ paymentId: 'pay-1', walletAdjusted: true });
    });

    it('lets other errors (503 UNAVAILABLE, 403) through untouched', async () => {
        const { service, finance } = setup();
        const down = legacy('UNAVAILABLE', 503);
        finance.refundPayment.mockRejectedValue(down);
        await expect(service.refund({ paymentId: 'p', reason: 'duplicate charge' }, ctx, md, 'k')).rejects.toBe(down);
    });
});

describe('AdminFinanceService.credit', () => {
    const body = { userId: 'user-1', amount: 50, direction: 'ADD' as const, reason: 'goodwill credit' };
    const res = { userId: 'user-1', walletId: 'w1', previousBalance: 10, newBalance: 60, amount: 50, direction: 'ADD', alreadyApplied: false };

    it('adjusts via finance and returns the historical CreditResult', async () => {
        const { service, finance, audit } = setup();
        finance.adjustBalance.mockResolvedValue(res);
        const out = await service.credit(body, ctx, md, 'k1');
        expect(out).toEqual({ userId: 'user-1', walletId: 'w1', previousBalance: 10, newBalance: 60, amount: 50, direction: 'ADD', alreadyApplied: false });
        expect(finance.adjustBalance).toHaveBeenCalledWith({ ...body, idempotencyKey: 'k1' }, md);
        expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.finance.credit' }));
    });

    it.each([5.5, 0.1])('rejects a fractional amount %p before it can be truncated on the wire', async (amount) => {
        const { service, finance } = setup();
        const err = await service.credit({ ...body, amount }, ctx, md, 'k').catch((e) => e);
        expect(err.getStatus()).toBe(400);
        expect(finance.adjustBalance).not.toHaveBeenCalled();
    });

    it('INSUFFICIENT_CREDITS stays a 400 with the historical message', async () => {
        const { service, finance } = setup();
        finance.adjustBalance.mockRejectedValue(legacy('INSUFFICIENT_CREDITS', 422));
        const err = await service.credit({ ...body, direction: 'SUBTRACT' }, ctx, md, 'k').catch((e) => e);
        expect(err.getStatus()).toBe(400);
        expect(err.getResponse()).toMatchObject({ message: 'Insufficient balance for SUBTRACT adjustment' });
    });
});

describe('AdminFinanceService.setTier', () => {
    it('maps the response (empty previous cycle -> null) and audits from/to', async () => {
        const { service, finance, audit } = setup();
        finance.changeTier.mockResolvedValue({
            userId: 'u', previousTier: 0, newTier: 2, previousBillingCycle: '', newBillingCycle: 'monthly', isActive: true, alreadyApplied: false,
        });
        const out = await service.setTier({ userId: 'u', tier: 2, reason: 'promo upgrade' }, ctx, md, 'k');
        expect(out).toEqual({ userId: 'u', previousTier: 0, newTier: 2, previousBillingCycle: null, newBillingCycle: 'monthly', isActive: true, alreadyApplied: false });
        expect(finance.changeTier).toHaveBeenCalledWith(
            { userId: 'u', tier: 2, billingCycle: '', reason: 'promo upgrade', idempotencyKey: 'k' },
            md
        );
        expect(audit.write).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'admin.finance.tier_change', payload: expect.objectContaining({ to: { tier: 2, billingCycle: 'monthly' } }) })
        );
    });

    it('a replayed key reports alreadyApplied and is not audited again', async () => {
        const { service, finance, audit } = setup();
        finance.changeTier.mockResolvedValue({
            userId: 'u', previousTier: 2, newTier: 2, previousBillingCycle: 'monthly', newBillingCycle: 'monthly', isActive: true, alreadyApplied: true,
        });
        const out = await service.setTier({ userId: 'u', tier: 2, reason: 'promo upgrade' }, ctx, md, 'k');
        expect(out.alreadyApplied).toBe(true);
        expect(audit.write).not.toHaveBeenCalled();
    });
});

describe('AdminFinanceService.credit replay', () => {
    it('reports alreadyApplied and is not audited again', async () => {
        const { service, finance, audit } = setup();
        finance.adjustBalance.mockResolvedValue({
            userId: 'user-1', walletId: 'w1', previousBalance: 10, newBalance: 60, amount: 50, direction: 'ADD', alreadyApplied: true,
        });
        const out = await service.credit(
            { userId: 'user-1', amount: 50, direction: 'ADD', reason: 'goodwill credit' }, ctx, md, 'k1'
        );
        expect(out.alreadyApplied).toBe(true);
        expect(audit.write).not.toHaveBeenCalled();
    });
});
