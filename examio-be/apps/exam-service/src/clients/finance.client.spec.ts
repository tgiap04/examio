import { HttpException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { of } from 'rxjs';
import { buildMetadata } from '@examio/grpc';
import { FinanceClient, assertWholeCredits } from './finance.client';

function setup() {
    const wallet = {
        updateBalance: jest.fn((..._a: unknown[]) =>
            of({ success: true, newBalance: 15, message: '' })
        ),
    };
    const client = new FinanceClient({ getService: () => wallet } as unknown as ClientGrpc);
    client.onModuleInit();
    return { client, wallet };
}

const update = (amount: number) => ({
    userId: 'u1',
    amount,
    transactionType: 'SUBTRACT',
    description: 'd',
});

describe('FinanceClient money guard', () => {
    it.each([5.5, 0.1, -5, 0, NaN, Infinity, 2_147_483_648])(
        'rejects %p with a 400 and sends nothing',
        async (amount) => {
            const { client, wallet } = setup();
            const error = await client
                .updateBalance(update(amount), buildMetadata())
                .catch((e) => e);
            expect(error).toBeInstanceOf(HttpException);
            expect(error.getStatus()).toBe(400);
            expect(error.getResponse()).toMatchObject({ code: 'INVALID_AMOUNT' });
            expect(wallet.updateBalance).not.toHaveBeenCalled();
        }
    );

    it('passes a whole positive amount through unchanged', async () => {
        const { client, wallet } = setup();
        await expect(client.updateBalance(update(5), buildMetadata())).resolves.toMatchObject({
            newBalance: 15,
        });
        expect(wallet.updateBalance.mock.calls[0][0]).toMatchObject({ amount: 5 });
    });

    it('assertWholeCredits accepts the int32 maximum', () => {
        expect(() => assertWholeCredits(2_147_483_647)).not.toThrow();
    });
});
