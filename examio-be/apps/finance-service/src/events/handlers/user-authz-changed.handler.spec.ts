import { PermanentEventError, createEnvelope } from '@examio/messaging';
import { UserAuthzChangedHandler } from './user-authz-changed.handler';

const envelope = (data: unknown) =>
    createEnvelope('auth.user.authz_changed', data, { source: 'auth' });

const data = (over: Record<string, unknown> = {}) => ({
    userId: 'u1',
    authzVersion: 3,
    role: 'TEACHER',
    isSystemAdmin: false,
    isBanned: false,
    reason: 'role',
    version: 3,
    ...over,
});

describe('UserAuthzChangedHandler', () => {
    const tx = { __tx: true } as never;
    let ensure: { ensure: jest.Mock };
    let handler: UserAuthzChangedHandler;

    beforeEach(() => {
        ensure = { ensure: jest.fn().mockResolvedValue({ created: true }) };
        handler = new UserAuthzChangedHandler(ensure as never);
    });

    it('ensures the wallet in the consumer transaction when role=TEACHER', async () => {
        await handler.handle(envelope(data()), tx);
        expect(ensure.ensure).toHaveBeenCalledWith('u1', tx);
    });

    it.each(['role', 'admin', 'password', 'ban', 'unban', 'reapply'])(
        'provisions on any reason (%s) while role=TEACHER',
        async (reason) => {
            await handler.handle(envelope(data({ reason })), tx);
            expect(ensure.ensure).toHaveBeenCalledTimes(1);
        }
    );

    it('does nothing for STUDENT (including a demotion: the wallet is kept)', async () => {
        await handler.handle(envelope(data({ role: 'STUDENT', reason: 'role' })), tx);
        expect(ensure.ensure).not.toHaveBeenCalled();
    });

    it('is harmless on redelivery: each delivery just calls the idempotent ensure', async () => {
        ensure.ensure.mockResolvedValueOnce({ created: true }).mockResolvedValueOnce({ created: false });
        await handler.handle(envelope(data()), tx);
        await handler.handle(envelope(data()), tx);
        expect(ensure.ensure).toHaveBeenCalledTimes(2);
    });

    it('rejects malformed data permanently (never retried)', async () => {
        await expect(handler.handle(envelope({ authzVersion: 1, role: 'GOD', userId: 'u1' }), tx)).rejects.toBeInstanceOf(
            PermanentEventError
        );
    });
});
