import { OutboxService } from './outbox.service';

describe('OutboxService.add', () => {
    const tx = () => ({ outboxEvent: { create: jest.fn().mockResolvedValue({}) } });

    it('writes the envelope row inside the caller tx with the service as source', async () => {
        const t = tx();

        const env = await new OutboxService({ service: 'auth' }).add(t, 'auth.user.registered', { userId: 'u1' }, 'cor_1');

        expect(t.outboxEvent.create).toHaveBeenCalledWith({
            data: { id: env.id, source: 'auth', type: 'auth.user.registered', envelope: env },
        });
        expect(env.correlationId).toBe('cor_1');
    });

    it('rejects a type outside the service domain and a state event without a version', async () => {
        const t = tx();
        const svc = new OutboxService({ service: 'auth' });

        await expect(svc.add(t, 'exam.room.created', {})).rejects.toThrow(/source/);
        await expect(svc.add(t, 'auth.user.authz_changed', {})).rejects.toThrow(/authzVersion/);
        expect(t.outboxEvent.create).not.toHaveBeenCalled();
    });
});
