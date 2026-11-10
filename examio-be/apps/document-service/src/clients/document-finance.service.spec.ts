import { HttpException } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import type { FinanceClient } from '@examio/grpc';
import { ChargeFailedError, DocumentFinance } from './document-finance.service';

const grpcError = (code: number, details: string) => Object.assign(new Error(`${code}: ${details}`), { code, details });

function build(over: Partial<Record<'debit' | 'refund' | 'getUserBenefits', jest.Mock>> & { freeMode?: boolean } = {}) {
    const finance = {
        freeMode: over.freeMode ?? false,
        debit: over.debit ?? jest.fn(),
        refund: over.refund ?? jest.fn(),
        getUserBenefits: over.getUserBenefits ?? jest.fn(),
    };
    return { finance, service: new DocumentFinance(finance as unknown as FinanceClient) };
}

describe('DocumentFinance', () => {
    describe('filesPerMonth', () => {
        it('returns the plan limit, including -1 for unlimited', async () => {
            const { service } = build({ getUserBenefits: jest.fn().mockResolvedValue({ filesPerMonth: -1 }) });
            await expect(service.filesPerMonth('u1')).resolves.toBe(-1);
        });

        it('fails safe to the Free-tier limit when finance is unreachable', async () => {
            const { service } = build({ getUserBenefits: jest.fn().mockRejectedValue(grpcError(status.UNAVAILABLE, 'down')) });
            await expect(service.filesPerMonth('u1')).resolves.toBe(5);
        });
    });

    describe('debit', () => {
        it('forwards the user token and the doc key, and returns the new balance', async () => {
            const debit = jest.fn().mockResolvedValue({ skipped: false, newBalance: 7 });
            const { service } = build({ debit });
            await expect(service.debit('u1', 3, 'why', 'doc:1', 'tok')).resolves.toEqual({ newBalance: 7 });
            const [request, metadata] = debit.mock.calls[0];
            expect(request).toEqual({ userId: 'u1', amount: 3, reason: 'why', idempotencyKey: 'doc:1' });
            expect(metadata.get('authorization')).toEqual(['Bearer tok']);
        });

        it('AI_FREE_MODE (skipped by the shared client) charges nothing and reports no balance', async () => {
            const { service } = build({ debit: jest.fn().mockResolvedValue({ skipped: true, alreadyApplied: false }) });
            await expect(service.debit('u1', 3, 'why', 'doc:1')).resolves.toEqual({ newBalance: undefined });
        });

        it.each([
            ['INSUFFICIENT_CREDITS', 'INSUFFICIENT_CREDITS'],
            ['WALLET_NOT_FOUND', 'WALLET_NOT_FOUND'],
        ])('a definitive refusal (%s) is 403 and needs no compensation', async (details, code) => {
            const { service } = build({ debit: jest.fn().mockRejectedValue(grpcError(status.FAILED_PRECONDITION, details)) });
            const error = await service.debit('u1', 3, 'why', 'doc:1').catch((e) => e);
            expect(error).toBeInstanceOf(ChargeFailedError);
            expect(error.definitive).toBe(true);
            expect(error.httpError.getStatus()).toBe(403);
            expect((error.httpError.getResponse() as { code: string }).code).toBe(code);
        });

        it.each([
            [status.PERMISSION_DENIED, 403, 'PERMISSION_DENIED'],
            [status.INVALID_ARGUMENT, 400, 'VALIDATION_FAILED'],
        ])('gRPC status %i is a definitive refusal (HTTP %i %s): nothing was taken, no 10-minute park', async (code, http, errorCode) => {
            const { service } = build({ debit: jest.fn().mockRejectedValue(grpcError(code, 'x')) });
            const error = await service.debit('u1', 3, 'why', 'doc:1').catch((e) => e);
            expect(error.definitive).toBe(true);
            expect(error.httpError.getStatus()).toBe(http);
            expect((error.httpError.getResponse() as { code: string }).code).toBe(errorCode);
        });

        it.each([status.UNAVAILABLE, status.DEADLINE_EXCEEDED, status.INTERNAL])(
            'gRPC status %i leaves the outcome unknown: not definitive, still a 403 to the client',
            async (code) => {
                const { service } = build({ debit: jest.fn().mockRejectedValue(grpcError(code, 'x')) });
                const error = await service.debit('u1', 3, 'why', 'doc:1').catch((e) => e);
                expect(error.definitive).toBe(false);
                expect(error.httpError.getStatus()).toBe(403);
                expect((error.httpError.getResponse() as { code: string }).code).toBe('CHARGE_UNAVAILABLE');
            }
        );

        it('an invalid amount or key (400 from the client guard) is definitive and keeps its reason', async () => {
            const invalid = new HttpException({ statusCode: 400, code: 'INVALID_AMOUNT', message: 'bad' }, 400);
            const { service } = build({ debit: jest.fn().mockRejectedValue(invalid) });
            const error = await service.debit('u1', 0, 'why', 'doc:1').catch((e) => e);
            expect(error.definitive).toBe(true);
            expect(error.httpError).toBe(invalid);
        });
    });

    describe('refund', () => {
        it('returns true when finance reversed the debit', async () => {
            const refund = jest.fn().mockResolvedValue({ alreadyApplied: false });
            const { service } = build({ refund });
            await expect(service.refund('u1', 'doc:1', 'r')).resolves.toBe(true);
            expect(refund.mock.calls[0][0]).toEqual({ userId: 'u1', debitIdempotencyKey: 'doc:1', reason: 'r' });
            expect(refund.mock.calls[0][1].get('authorization')).toEqual([]); // the shared client attaches svc:document
        });

        it('NOT_FOUND means it was never charged: false, not an error', async () => {
            const { service } = build({ refund: jest.fn().mockRejectedValue(grpcError(status.NOT_FOUND, 'DEBIT_NOT_FOUND')) });
            await expect(service.refund('u1', 'doc:1', 'r')).resolves.toBe(false);
        });

        it('any other failure propagates so the caller can retry later', async () => {
            const { service } = build({ refund: jest.fn().mockRejectedValue(grpcError(status.UNAVAILABLE, 'down')) });
            await expect(service.refund('u1', 'doc:1', 'r')).rejects.toMatchObject({ code: status.UNAVAILABLE });
        });

        it('in AI_FREE_MODE nothing was debited, so finance is not called', async () => {
            const refund = jest.fn();
            const { service } = build({ refund, freeMode: true });
            await expect(service.refund('u1', 'doc:1', 'r')).resolves.toBe(false);
            expect(refund).not.toHaveBeenCalled();
        });
    });
});
