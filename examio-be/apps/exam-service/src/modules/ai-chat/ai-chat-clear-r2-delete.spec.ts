import { AIChatService } from './ai-chat.service';

describe('AIChatService.clearChat durable R2 delete', () => {
    it('deletes each file row and queues its R2 key in one tx, never calling R2', async () => {
        const tx = {
            userStorage: { delete: jest.fn(async () => ({})) },
        };
        const events: string[] = [];
        const prisma = {
            $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => {
                events.push('begin');
                const out = await fn(tx);
                events.push('commit');
                return out;
            }),
            userStorage: {
                findMany: jest.fn(async () => [
                    { id: 'd1', filename: 'a.pdf', keyR2: 'ai-uploads/u1/a.pdf' },
                    { id: 'd2', filename: 'b.pdf', keyR2: 'ai-teacher/u1/b.pdf' },
                ]),
            },
        };
        const chats = {
            findById: jest.fn(),
            getDocumentIds: jest.fn(async () => ['d1', 'd2']),
            deleteChat: jest.fn(async () => undefined),
        };
        const writer = {
            enqueue: jest.fn(async (t: unknown, keys: unknown[]) => {
                events.push(`enqueue tx=${t === tx} ${JSON.stringify(keys)}`);
                return keys.length;
            }),
        };
        const service = new AIChatService(chats as never, {} as never, writer as never, {} as never, prisma as never);
        jest
            .spyOn(service as unknown as { getChatByIdAndValidateOwner: () => Promise<unknown> }, 'getChatByIdAndValidateOwner')
            .mockResolvedValue({});
        const res = await service.clearChat('c1', { id: 'u1' } as never, true);
        expect(res.deletedFiles).toEqual(['a.pdf', 'b.pdf']);
        expect(events).toEqual([
            'begin',
            'enqueue tx=true ["ai-uploads/u1/a.pdf"]',
            'commit',
            'begin',
            'enqueue tx=true ["ai-teacher/u1/b.pdf"]',
            'commit',
        ]);
    });

    function setupClear(rows: Array<{ id: string; filename: string; keyR2: string }>) {
        const tx = { userStorage: { delete: jest.fn(async () => ({})) } };
        const prisma = {
            $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
            userStorage: { findMany: jest.fn(async () => rows) },
        };
        const chats = {
            getDocumentIds: jest.fn(async () => rows.map((r) => r.id)),
            deleteChat: jest.fn(async () => undefined),
        };
        const writer = { enqueue: jest.fn(async (_t: unknown, keys: unknown[]) => keys.length) };
        const service = new AIChatService(chats as never, {} as never, writer as never, {} as never, prisma as never);
        jest
            .spyOn(service as unknown as { getChatByIdAndValidateOwner: () => Promise<unknown> }, 'getChatByIdAndValidateOwner')
            .mockResolvedValue({});
        return { service, prisma, writer };
    }

    it('H3: only loads the caller own files and never queues a foreign or legacy key', async () => {
        const { service, prisma, writer } = setupClear([
            { id: 'd1', filename: 'a.pdf', keyR2: 'ai-uploads/victim/a.pdf' },
            { id: 'd2', filename: 'b.pdf', keyR2: 'documents/u1/b.pdf' },
        ]);
        await service.clearChat('c1', { id: 'u1' } as never, true);
        expect(prisma.userStorage.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: { in: ['d1', 'd2'] }, userId: 'u1' } })
        );
        expect(writer.enqueue).toHaveBeenNthCalledWith(1, expect.anything(), [null]);
        expect(writer.enqueue).toHaveBeenNthCalledWith(2, expect.anything(), [null]);
    });
});
