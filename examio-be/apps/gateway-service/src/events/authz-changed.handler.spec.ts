import { PermanentEventError, type Envelope } from '@examio/messaging';
import { AuthzChangedHandler } from './authz-changed.handler';

const envelope = (data: unknown): Envelope =>
    ({ id: 'evt_1', type: 'auth.user.authz_changed', version: 1, occurredAt: '', source: 'auth', correlationId: 'c', data }) as Envelope;

describe('AuthzChangedHandler', () => {
    const setup = () => {
        const state = { raiseAuthzVersion: jest.fn().mockResolvedValue(undefined) };
        return { state, handler: new AuthzChangedHandler(state as never) };
    };

    it('raises the stored authz version to data.authzVersion', async () => {
        const { handler, state } = setup();
        await handler.onAuthzChanged(envelope({ userId: 'u1', authzVersion: 4, role: 'TEACHER', reason: 'role' }));
        expect(state.raiseAuthzVersion).toHaveBeenCalledWith('u1', 4);
    });

    it.each([
        {},
        { userId: '', authzVersion: 1 },
        { userId: 'u1' },
        { userId: 'u1', authzVersion: -1 },
        { userId: 'u1', authzVersion: 1.5 },
        { userId: 'u1', authzVersion: '4' },
        null,
    ])('a malformed payload (%j) is a permanent error: dead-lettered, never retried', async (data) => {
        const { handler, state } = setup();
        await expect(handler.onAuthzChanged(envelope(data))).rejects.toBeInstanceOf(PermanentEventError);
        expect(state.raiseAuthzVersion).not.toHaveBeenCalled();
    });

    it('a Redis failure propagates so the consumer retries (durable path)', async () => {
        const { handler, state } = setup();
        state.raiseAuthzVersion.mockRejectedValue(new Error('Redis is not ready'));
        const error = await handler
            .onAuthzChanged(envelope({ userId: 'u1', authzVersion: 2 }))
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(PermanentEventError);
    });
});
