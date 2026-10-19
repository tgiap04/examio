import { OutboxService } from '@examio/messaging';
import { SESSION_REVOKED, SessionRevokedPublisher } from './session-revoked.publisher';

describe('SessionRevokedPublisher', () => {
    it('writes an auth.session.revoked fact event through the outbox, in the caller\'s tx', async () => {
        const create = jest.fn().mockResolvedValue({});
        const tx = { outboxEvent: { create } };
        const publisher = new SessionRevokedPublisher(new OutboxService({ service: 'auth' }));

        await publisher.publish(tx as never, { userId: 'u1', sid: 's1', exp: 1_900_000_960 }, 1_900_000_000);

        expect(create).toHaveBeenCalledTimes(1);
        const row = create.mock.calls[0][0].data;
        expect(row).toMatchObject({ source: 'auth', type: SESSION_REVOKED });
        expect(row.envelope).toMatchObject({
            id: expect.stringMatching(/^evt_/),
            type: 'auth.session.revoked',
            source: 'auth',
            version: 1,
            data: { userId: 'u1', sid: 's1', exp: '1900000960', version: '1900000000' },
        });
    });

    it('defaults the revocation time to now (epoch seconds)', async () => {
        const create = jest.fn().mockResolvedValue({});
        const publisher = new SessionRevokedPublisher(new OutboxService({ service: 'auth' }));
        const before = Math.floor(Date.now() / 1000);
        await publisher.publish({ outboxEvent: { create } } as never, { userId: 'u', sid: 's', exp: before + 960 });
        const version = Number(create.mock.calls[0][0].data.envelope.data.version);
        expect(version).toBeGreaterThanOrEqual(before);
        expect(version).toBeLessThanOrEqual(before + 2);
    });

    it('a failed outbox write propagates, so the surrounding transaction rolls back', async () => {
        const create = jest.fn().mockRejectedValue(new Error('outbox down'));
        const publisher = new SessionRevokedPublisher(new OutboxService({ service: 'auth' }));
        await expect(
            publisher.publish({ outboxEvent: { create } } as never, { userId: 'u', sid: 's', exp: 1 })
        ).rejects.toThrow('outbox down');
    });
});
