import { PermanentEventError, type Envelope } from '@examio/messaging';
import { SessionRevokedHandler } from './session-revoked.handler';

const NOW = 1_900_000_000;
const envelope = (data: unknown): Envelope =>
    ({ id: 'evt_1', type: 'auth.session.revoked', version: 1, occurredAt: '', source: 'auth', correlationId: 'c', data }) as Envelope;

describe('SessionRevokedHandler', () => {
    beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000));
    afterEach(() => jest.restoreAllMocks());

    const setup = () => {
        const state = { revokeSession: jest.fn().mockResolvedValue(undefined) };
        return { state, handler: new SessionRevokedHandler(state as never) };
    };

    it('denies the sid until exp (the key TTL is exp - now), accepting the int64 strings the publisher writes', async () => {
        const { handler, state } = setup();
        await handler.onSessionRevoked(envelope({ userId: 'u1', sid: 's1', exp: String(NOW + 960), version: String(NOW) }));
        expect(state.revokeSession).toHaveBeenCalledWith('s1', NOW + 960);
    });

    it('also accepts numeric fields', async () => {
        const { handler, state } = setup();
        await handler.onSessionRevoked(envelope({ userId: 'u1', sid: 's1', exp: NOW + 5, version: NOW }));
        expect(state.revokeSession).toHaveBeenCalledWith('s1', NOW + 5);
    });

    it.each([NOW, NOW - 1, NOW - 86_400])('skips a revocation that already expired (exp %i): nothing to deny', async (exp) => {
        const { handler, state } = setup();
        await handler.onSessionRevoked(envelope({ userId: 'u1', sid: 's1', exp, version: NOW }));
        expect(state.revokeSession).not.toHaveBeenCalled();
    });

    it.each([
        {},
        null,
        { userId: 'u1', exp: NOW + 10, version: 1 },
        { userId: 'u1', sid: '', exp: NOW + 10, version: 1 },
        { userId: 'u1', sid: 's', exp: 'soon', version: 1 },
        { userId: 'u1', sid: 's', exp: 1.5, version: 1 },
        { userId: '', sid: 's', exp: NOW + 10, version: 1 },
    ])('a malformed payload (%j) is permanent: dead-lettered, never retried', async (data) => {
        const { handler, state } = setup();
        await expect(handler.onSessionRevoked(envelope(data))).rejects.toBeInstanceOf(PermanentEventError);
        expect(state.revokeSession).not.toHaveBeenCalled();
    });

    it('a Redis failure propagates so the consumer retries', async () => {
        const { handler, state } = setup();
        state.revokeSession.mockRejectedValue(new Error('Redis is not ready'));
        const error = await handler
            .onSessionRevoked(envelope({ userId: 'u1', sid: 's1', exp: NOW + 100, version: NOW }))
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(PermanentEventError);
    });
});
