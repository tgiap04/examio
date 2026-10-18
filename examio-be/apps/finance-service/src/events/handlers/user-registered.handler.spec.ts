import { PermanentEventError, createEnvelope } from '@examio/messaging';
import { UserRegisteredHandler } from './user-registered.handler';

const envelope = (data: unknown) =>
    createEnvelope('auth.user.registered', data, { source: 'auth' });

describe('UserRegisteredHandler', () => {
    let tx: {
        wallet: { findUnique: jest.Mock; create: jest.Mock };
        walletTransaction: { create: jest.Mock };
    };
    let handler: UserRegisteredHandler;
    let n: number;

    beforeEach(() => {
        n = 0;
        tx = {
            wallet: {
                findUnique: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockImplementation(async ({ data }) => data),
            },
            walletTransaction: { create: jest.fn().mockResolvedValue({}) },
        };
        handler = new UserRegisteredHandler({
            generateId: () => `id-${++n}`,
        } as never);
    });

    it('creates the wallet with 20 credits and one welcome transaction', async () => {
        await handler.handle(
            envelope({ userId: 'u1', email: 'a@b.c', username: 'a', utmSource: null }),
            tx as never
        );

        expect(tx.wallet.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ userId: 'u1', balance: 20 }),
        });
        expect(tx.walletTransaction.create).toHaveBeenCalledTimes(1);
        expect(tx.walletTransaction.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                walletId: 'id-1',
                amount: 20,
                type: 1,
                direction: 'ADD',
            }),
        });
    });

    it('does nothing when the wallet already exists (no double credit)', async () => {
        tx.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1' });

        await handler.handle(envelope({ userId: 'u1', email: 'a@b.c' }), tx as never);

        expect(tx.wallet.create).not.toHaveBeenCalled();
        expect(tx.walletTransaction.create).not.toHaveBeenCalled();
    });

    it('rejects a payload without userId as permanent (DLQ, no retry)', async () => {
        await expect(
            handler.handle(envelope({ email: 'a@b.c' }), tx as never)
        ).rejects.toBeInstanceOf(PermanentEventError);
    });

    it('lets database errors propagate so the consumer retries', async () => {
        tx.wallet.create.mockRejectedValue(new Error('connection reset'));

        await expect(
            handler.handle(envelope({ userId: 'u1', email: 'a@b.c' }), tx as never)
        ).rejects.toThrow('connection reset');
    });
});
