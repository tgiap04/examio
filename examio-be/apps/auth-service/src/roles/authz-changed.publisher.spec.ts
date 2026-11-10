import { OutboxService } from '@examio/messaging';
import { AuthzChangedPublisher } from './authz-changed.publisher';

describe('AuthzChangedPublisher', () => {
    function setup() {
        const created: Array<{ data: { id: string; source: string; type: string; envelope: Record<string, unknown> } }> = [];
        const tx = { outboxEvent: { create: jest.fn(async (args: (typeof created)[number]) => void created.push(args)) } };
        const publisher = new AuthzChangedPublisher(new OutboxService({ service: 'auth' } as never));
        return { publisher, tx, created };
    }
    const snapshot = { id: 'u1', authzVersion: 7, role: 'TEACHER', isSystemAdmin: true, isBanned: false };

    it('writes one outbox row: type auth.user.authz_changed, source auth, in the caller tx', async () => {
        const { publisher, tx, created } = setup();
        await publisher.publish(tx as never, snapshot, 'role');
        expect(created).toHaveLength(1);
        const { data } = created[0];
        expect(data.type).toBe('auth.user.authz_changed');
        expect(data.source).toBe('auth');
        expect(data.envelope).toMatchObject({
            type: 'auth.user.authz_changed',
            source: 'auth',
            version: 1,
            id: data.id,
        });
        expect(data.id).toMatch(/^evt_/);
    });

    it('the payload carries version = authzVersion plus role/flags/reason', async () => {
        const { publisher, tx, created } = setup();
        await publisher.publish(tx as never, snapshot, 'admin');
        expect(created[0].data.envelope.data).toEqual({
            userId: 'u1',
            authzVersion: 7,
            role: 'TEACHER',
            isSystemAdmin: true,
            isBanned: false,
            reason: 'admin',
            version: 7,
        });
    });

    it.each(['role', 'admin', 'password', 'ban', 'unban', 'reapply'] as const)('accepts reason %s', async (reason) => {
        const { publisher, tx, created } = setup();
        await publisher.publish(tx as never, snapshot, reason);
        expect((created[0].data.envelope.data as { reason: string }).reason).toBe(reason);
    });

    it('a re-apply keeps the unchanged authzVersion as the version', async () => {
        const { publisher, tx, created } = setup();
        await publisher.publish(tx as never, { ...snapshot, authzVersion: 4 }, 'reapply');
        expect(created[0].data.envelope.data).toMatchObject({ authzVersion: 4, version: 4, reason: 'reapply' });
    });

    it('a non-numeric authzVersion is refused by the state-event envelope rules', async () => {
        const { publisher, tx } = setup();
        await expect(publisher.publish(tx as never, { ...snapshot, authzVersion: Number.NaN }, 'role')).rejects.toThrow(/authzVersion/);
    });
});
