import { PermanentEventError, type Envelope } from '@examio/messaging';
import { EVENT_HANDLER_METADATA } from '@examio/messaging';
import { USER_UPDATED, UserUpdatedHandler } from './user-updated.handler';

const envelope = (data: unknown) => ({ id: 'e1', type: USER_UPDATED, data }) as unknown as Envelope;

describe('UserUpdatedHandler', () => {
    it('drops the cached public profile of the changed user', async () => {
        const auth = { invalidate: jest.fn().mockResolvedValue(undefined) };
        const h = new UserUpdatedHandler(auth as never);
        await h.onUserUpdated(envelope({ userId: 'u1', changed: ['name'], version: 5 }));
        expect(auth.invalidate).toHaveBeenCalledWith('u1');
    });

    it('a malformed payload is a permanent error (dead-letter, no retry loop)', async () => {
        const auth = { invalidate: jest.fn() };
        const h = new UserUpdatedHandler(auth as never);
        await expect(h.onUserUpdated(envelope({ changed: [] }))).rejects.toBeInstanceOf(
            PermanentEventError
        );
        expect(auth.invalidate).not.toHaveBeenCalled();
    });

    it('a Redis failure propagates so the consumer retries (a stale name must not outlive the event)', async () => {
        const auth = { invalidate: jest.fn().mockRejectedValue(new Error('redis down')) };
        const h = new UserUpdatedHandler(auth as never);
        await expect(h.onUserUpdated(envelope({ userId: 'u1' }))).rejects.toThrow('redis down');
    });

    it('is registered for auth.user.updated without the dedupe transaction (DEL is idempotent)', () => {
        const meta = Reflect.getMetadata(
            EVENT_HANDLER_METADATA,
            UserUpdatedHandler.prototype.onUserUpdated
        );
        expect(meta).toEqual({ type: 'auth.user.updated', options: { dedupe: false } });
    });
});
