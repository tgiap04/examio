import { HttpException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata, status } from '@grpc/grpc-js';
import { of, throwError } from 'rxjs';
import { buildMetadata } from '../metadata';
import { FinanceClient, assertWholeCredits } from './finance.client';

const txResponse = (over = {}) => ({
    transaction: { id: 't1', balanceAfter: 15, ...over },
    alreadyApplied: false,
});

function setup(env: Record<string, string | undefined> = {}) {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
    const wallet = {
        debit: jest.fn((..._a: unknown[]) => of(txResponse())),
        credit: jest.fn((..._a: unknown[]) => of(txResponse())),
        refund: jest.fn((..._a: unknown[]) => of(txResponse())),
        getWallet: jest.fn((..._a: unknown[]) => of({ walletId: 'w', userId: 'u', balance: 3 })),
    };
    const subscription = { getUserBenefits: jest.fn((..._a: unknown[]) => of({ tier: 1 })) };
    const attacher = { attach: jest.fn(async (md: Metadata) => md) };
    const client = new FinanceClient(
        { getService: (name: string) => (name === 'WalletService' ? wallet : subscription) } as unknown as ClientGrpc,
        attacher
    );
    client.onModuleInit();
    process.env = saved;
    return { client, wallet, subscription, attacher };
}
const req = (over = {}) => ({ userId: 'u1', amount: 5, reason: 'r', idempotencyKey: 'k1', ...over });
const grpcError = (code: number, details: string) =>
    Object.assign(new Error(`${code} ${details}`), { code, details });

describe('FinanceClient.debit', () => {
    it('sends the request with a finance-audience service token and returns the new balance', async () => {
        const { client, wallet, attacher } = setup({ AI_FREE_MODE: undefined });
        const md = buildMetadata();
        const res = await client.debit(req(), md);
        expect(res).toMatchObject({ skipped: false, alreadyApplied: false, newBalance: 15 });
        expect(attacher.attach).toHaveBeenCalledWith(md, 'finance');
        expect(wallet.debit.mock.calls[0][0]).toEqual(req());
    });

    it.each([5.5, 0.1, -5, 0, NaN, Infinity, 2_147_483_648])('rejects amount %p with a 400 and sends nothing', async (amount) => {
        const { client, wallet } = setup();
        const err = await client.debit(req({ amount }), buildMetadata()).catch((e) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(400);
        expect(err.getResponse()).toMatchObject({ code: 'INVALID_AMOUNT' });
        expect(wallet.debit).not.toHaveBeenCalled();
    });

    it('rejects a blank idempotency key before the wire', async () => {
        const { client, wallet } = setup();
        const err = await client.debit(req({ idempotencyKey: ' ' }), buildMetadata()).catch((e) => e);
        expect(err.getResponse()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
        expect(wallet.debit).not.toHaveBeenCalled();
    });

    it('retries Debit on UNAVAILABLE with the SAME key (key-guarded, allowlisted)', async () => {
        const { client, wallet } = setup();
        wallet.debit
            .mockReturnValueOnce(throwError(() => grpcError(status.UNAVAILABLE, 'down')))
            .mockReturnValue(of(txResponse()));
        await client.debit(req(), buildMetadata());
        expect(wallet.debit).toHaveBeenCalledTimes(2);
        expect(wallet.debit.mock.calls[1][0]).toEqual(req());
    });

    it('lets gRPC errors through untouched (INSUFFICIENT_CREDITS)', async () => {
        const { client, wallet } = setup();
        wallet.debit.mockReturnValue(throwError(() => grpcError(status.FAILED_PRECONDITION, 'INSUFFICIENT_CREDITS')));
        await expect(client.debit(req(), buildMetadata())).rejects.toMatchObject({
            code: status.FAILED_PRECONDITION,
            details: 'INSUFFICIENT_CREDITS',
        });
    });
});

describe('AI_FREE_MODE', () => {
    it('true outside production: no RPC, skipped', async () => {
        const { client, wallet, attacher } = setup({ AI_FREE_MODE: 'true', NODE_ENV: 'test' });
        expect(client.freeMode).toBe(true);
        await expect(client.debit(req(), buildMetadata())).resolves.toMatchObject({ skipped: true });
        expect(wallet.debit).not.toHaveBeenCalled();
        expect(attacher.attach).not.toHaveBeenCalled();
    });

    it('NODE_ENV=production forces it OFF: the debit goes through', async () => {
        const { client, wallet } = setup({ AI_FREE_MODE: 'true', NODE_ENV: 'production' });
        expect(client.freeMode).toBe(false);
        await expect(client.debit(req(), buildMetadata())).resolves.toMatchObject({ skipped: false });
        expect(wallet.debit).toHaveBeenCalledTimes(1);
    });

    it('anything but the string "true" leaves charging on', () => {
        expect(setup({ AI_FREE_MODE: '1' }).client.freeMode).toBe(false);
        expect(setup({ AI_FREE_MODE: undefined }).client.freeMode).toBe(false);
    });

    it('does not bypass Credit or Refund (they only exist after a real debit)', async () => {
        const { client, wallet } = setup({ AI_FREE_MODE: 'true', NODE_ENV: 'test' });
        await client.credit(req(), buildMetadata());
        await client.refund({ userId: 'u1', debitIdempotencyKey: 'k1', reason: 'r' }, buildMetadata());
        expect(wallet.credit).toHaveBeenCalledTimes(1);
        expect(wallet.refund).toHaveBeenCalledTimes(1);
    });
});

describe('FinanceClient reads', () => {
    it('getUserBenefits uses the finance service token', async () => {
        const { client, attacher } = setup();
        await expect(client.getUserBenefits('u1', buildMetadata())).resolves.toEqual({ tier: 1 });
        expect(attacher.attach).toHaveBeenCalledWith(expect.anything(), 'finance');
    });

    it('assertWholeCredits accepts the int32 maximum', () => {
        expect(() => assertWholeCredits(2_147_483_647)).not.toThrow();
    });
});
