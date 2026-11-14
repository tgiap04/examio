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

    describe('alsoPublishes', () => {
        const exam = new OutboxService({ service: 'exam', alsoPublishes: ['content'] });

        it('writes a declared foreign domain with that domain as source', async () => {
            const t = tx();

            const env = await exam.add(t, 'content.generation.requested', { jobId: 'j1' });

            expect(env.source).toBe('content');
            expect(t.outboxEvent.create).toHaveBeenCalledWith({
                data: { id: env.id, source: 'content', type: 'content.generation.requested', envelope: env },
            });
        });

        it('still writes its own domain with itself as source', async () => {
            const env = await exam.add(tx(), 'exam.room.created', {});

            expect(env.source).toBe('exam');
        });

        it('keeps rejecting a domain that was not declared', async () => {
            const t = tx();

            await expect(exam.add(t, 'document.deleted', {})).rejects.toThrow(/source/);
            await expect(exam.add(t, 'ai.generation.completed', {})).rejects.toThrow(/source/);
            expect(t.outboxEvent.create).not.toHaveBeenCalled();
        });

        it('does not let a service without the declaration publish that domain', async () => {
            await expect(new OutboxService({ service: 'exam' }).add(tx(), 'content.generation.requested', {})).rejects.toThrow(
                /source/
            );
        });
    });
});
