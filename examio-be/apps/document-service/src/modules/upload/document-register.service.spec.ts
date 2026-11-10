import { DocumentRegisterService } from './document-register.service';

const dto = { filename: 'a.pdf', url: 'https://r2/ai-uploads/u1/a.pdf', mimetype: 'application/pdf', size: 3 * 1024 * 1024, keyR2: 'ai-uploads/u1/a.pdf' };

const row = (over: Record<string, unknown> = {}) => ({
    id: 'd1',
    userId: 'u1',
    ...dto,
    processingStatus: 'PENDING',
    queuedAt: new Date(),
    pageCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
});

function build() {
    const tx = { tag: 'tx' };
    const prisma = { $transaction: jest.fn(async (fn: (db: unknown) => unknown) => fn(tx)) };
    const repo = {
        findByKey: jest.fn().mockResolvedValue(null),
        insert: jest.fn(async (_db: unknown, data: Record<string, unknown>) => row(data)),
        findRaw: jest.fn(),
    };
    const queue = {
        downloadUrl: jest.fn().mockResolvedValue('https://r2.test/signed'),
        recordUploaded: jest.fn().mockResolvedValue(undefined),
    };
    const processing = { ensureProcessed: jest.fn(async () => row({ processingStatus: 'PENDING' })) };
    const ids = { generateId: () => 'd1' };
    const service = new DocumentRegisterService(prisma as never, repo as never, queue as never, processing as never, ids as never);
    return { service, tx, prisma, repo, queue, processing };
}

describe('DocumentRegisterService.register (POST /ai/upload)', () => {
    it('inserts the row PENDING and its document.uploaded outbox row in ONE transaction, with no charge and no quota (a 6th upload in a month is accepted like the first)', async () => {
        const h = build();

        const res = await h.service.register('u1', dto as never);

        expect(res).toEqual({ id: 'd1', status: 'PENDING', message: expect.any(String) });
        expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(h.repo.insert).toHaveBeenCalledWith(
            h.tx,
            expect.objectContaining({ id: 'd1', userId: 'u1', keyR2: dto.keyR2, processingStatus: 'PENDING', queuedAt: expect.any(Date) })
        );
        expect(h.queue.recordUploaded).toHaveBeenCalledWith(h.tx, expect.objectContaining({ id: 'd1' }), 'https://r2.test/signed');
    });

    it('a storage outage answers 503 before any row exists', async () => {
        const h = build();
        h.queue.downloadUrl.mockRejectedValue(Object.assign(new Error('r2 down'), { status: 503 }));
        await expect(h.service.register('u1', dto as never)).rejects.toThrow('r2 down');
        expect(h.repo.insert).not.toHaveBeenCalled();
    });

    it('a key outside the caller area is 400 and nothing is inserted', async () => {
        const h = build();
        await expect(h.service.register('u1', { ...dto, keyR2: 'ai-uploads/u2/a.pdf' } as never)).rejects.toMatchObject({ status: 400 });
        expect(h.repo.insert).not.toHaveBeenCalled();
    });

    it('a second register of the same key returns the same id (FAILED is re-queued); another owner is 409', async () => {
        const h = build();
        h.repo.findByKey.mockResolvedValue(row({ processingStatus: 'FAILED' }));
        await expect(h.service.register('u1', dto as never)).resolves.toMatchObject({ id: 'd1', status: 'PENDING' });
        expect(h.processing.ensureProcessed).toHaveBeenCalledWith('u1', 'd1');
        expect(h.repo.insert).not.toHaveBeenCalled();

        await expect(h.service.register('u2', { ...dto, keyR2: 'ai-uploads/u2/a.pdf' } as never)).rejects.toMatchObject({ status: 409 });
    });

    it('losing the insert race on the unique key continues with the winner row', async () => {
        const h = build();
        h.repo.insert.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
        h.repo.findByKey.mockResolvedValueOnce(null).mockResolvedValueOnce(row({ processingStatus: 'PENDING' }));
        await expect(h.service.register('u1', dto as never)).resolves.toMatchObject({ id: 'd1', status: 'PENDING' });
    });
});
