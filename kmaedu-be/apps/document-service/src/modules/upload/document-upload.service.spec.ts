import { DocumentUploadService } from './document-upload.service';

const file = { filename: 'a.pdf', mimetype: 'application/pdf', data: Buffer.alloc(1024, 7) };

function build() {
    const tx = { tag: 'tx' };
    const prisma = { $transaction: jest.fn(async (fn: (db: unknown) => unknown) => fn(tx)) };
    const repo = {
        findDuplicate: jest.fn().mockResolvedValue(null),
        insert: jest.fn(async (_db: unknown, data: Record<string, unknown>) => ({ ...data, createdAt: new Date(), updatedAt: new Date() })),
    };
    const queue = {
        downloadUrl: jest.fn().mockResolvedValue('https://r2.test/signed'),
        recordUploaded: jest.fn().mockResolvedValue(undefined),
    };
    const r2 = {
        uploadFile: jest.fn().mockResolvedValue('ai-uploads/u1/1-a.pdf'),
        getPublicUrl: jest.fn((key: string) => `https://r2/${key}`),
    };
    const r2Deletes = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const ids = { generateId: () => 'd1' };
    const service = new DocumentUploadService(
        prisma as never,
        repo as never,
        queue as never,
        r2 as never,
        r2Deletes as never,
        ids as never
    );
    return { service, tx, repo, queue, r2Deletes };
}

describe('DocumentUploadService (no monthly quota, no charge)', () => {
    it('CreateUpload stores the file and commits the PENDING row with document.uploaded, whatever the monthly count', async () => {
        const h = build();

        const outcome = await h.service.createFromBytes('u1', file, { reuseDuplicate: false });

        expect(outcome).toEqual({ document: expect.objectContaining({ id: 'd1', processingStatus: 'PENDING' }), reused: false });
        expect(h.repo.insert).toHaveBeenCalledWith(h.tx, expect.objectContaining({ processingStatus: 'PENDING', queuedAt: expect.any(Date) }));
        expect(h.queue.recordUploaded).toHaveBeenCalledWith(h.tx, expect.objectContaining({ id: 'd1' }), 'https://r2.test/signed');
    });

    it('quick-upload is never quota-checked and is not queued for OCR', async () => {
        const h = build();

        await expect(h.service.quick('u1', file)).resolves.toMatchObject({ success: true, userStorageId: 'd1' });

        expect(h.queue.recordUploaded).not.toHaveBeenCalled();
    });

    it('a duplicate is reused without storing again', async () => {
        const h = build();
        h.repo.findDuplicate.mockResolvedValue({ id: 'old' });
        await expect(h.service.createFromBytes('u1', file, { reuseDuplicate: true })).resolves.toEqual({ document: { id: 'old' }, reused: true });
        expect(h.repo.insert).not.toHaveBeenCalled();
    });

    it('a failed row insert queues the stored object for deletion', async () => {
        const h = build();
        h.queue.recordUploaded.mockRejectedValue(new Error('db down'));
        await expect(h.service.createFromBytes('u1', file, { reuseDuplicate: false })).rejects.toThrow('db down');
        expect(h.r2Deletes.enqueue).toHaveBeenCalledWith(h.tx, ['ai-uploads/u1/1-a.pdf']);
    });
});
