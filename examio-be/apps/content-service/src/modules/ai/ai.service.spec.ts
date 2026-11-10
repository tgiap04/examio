import { BadRequestException, ConflictException } from '@nestjs/common';
import { documentV1 } from '@examio/contracts';
import { AIService } from './ai.service';
import { ChargeRefusedException, ChargeUnknownException } from './generation-job.service';
import { chargePlan, parseGenerateQuantity, uploadCredits } from './generation-request-rules';

const Status = documentV1.DocumentProcessingStatus;
const MB = 1024 * 1024;
const info = (over: Partial<documentV1.DocumentInfo> = {}): documentV1.DocumentInfo => ({
    id: 'd1',
    userId: 'u1',
    filename: 'a.pdf',
    mimetype: 'application/pdf',
    size: String(MB),
    keyR2: 'k',
    url: 'u',
    processingStatus: Status.DOCUMENT_PROCESSING_STATUS_COMPLETED,
    creditCharged: false,
    pageCount: 0,
    createdAt: '1',
    updatedAt: '1',
    ...over,
});

describe('chargePlan', () => {
    it('a new file pays upload + generation in one amount', () => {
        expect(chargePlan(info({ size: String(MB) }), false)).toEqual({ amount: 1 + 5, ensureProcessed: false });
        expect(chargePlan(info({ size: String(3 * MB) }), false)).toEqual({ amount: 2 + 5, ensureProcessed: false });
        expect(chargePlan(info({ size: '1' }), false).amount).toBe(6);
    });

    it('a reused COMPLETED or PROCESSING document pays the generation only', () => {
        for (const processingStatus of [Status.DOCUMENT_PROCESSING_STATUS_COMPLETED, Status.DOCUMENT_PROCESSING_STATUS_PROCESSING]) {
            expect(chargePlan(info({ processingStatus }), true)).toEqual({ amount: 5, ensureProcessed: false });
        }
    });

    it('a reused FAILED or PENDING document re-queues its OCR and always pays the generation (no free retry)', () => {
        for (const processingStatus of [Status.DOCUMENT_PROCESSING_STATUS_FAILED, Status.DOCUMENT_PROCESSING_STATUS_PENDING]) {
            expect(chargePlan(info({ processingStatus }), true)).toEqual({ amount: 5, ensureProcessed: true });
        }
    });

    it('uploadCredits is 1 per started 2 MB', () => {
        expect([0, 1, 2 * MB, 2 * MB + 1, 5 * MB].map(uploadCredits)).toEqual([0, 1, 1, 2, 3]);
    });
});

describe('parseGenerateQuantity', () => {
    it('defaults to 10, falls back on junk, accepts up to 50 and refuses more', () => {
        expect(parseGenerateQuantity(undefined, 'x')).toBe(10);
        expect(parseGenerateQuantity('abc', 'x')).toBe(10);
        expect(parseGenerateQuantity('0', 'x')).toBe(10);
        expect(parseGenerateQuantity('50', 'x')).toBe(50);
        expect(() => parseGenerateQuantity('51', 'câu hỏi quiz')).toThrow(BadRequestException);
    });
});

describe('AIService.generateFromFile orchestration', () => {
    const user = { id: 'u1' } as never;
    const file = { originalname: 'a.pdf', mimetype: 'application/pdf', size: MB, buffer: Buffer.alloc(10) } as Express.Multer.File;
    const dto = { typeResult: '1' } as never;

    function build(over: { upload?: Partial<documentV1.CreateUploadResponse>; submit?: jest.Mock; running?: unknown } = {}) {
        const documents = {
            createUpload: jest.fn().mockResolvedValue({ document: info(), reused: false, ...over.upload }),
            ensureProcessed: jest.fn().mockResolvedValue(info()),
            deleteDocuments: jest.fn().mockResolvedValue({ deleted: [], notFoundIds: [] }),
            getDocumentsByIds: jest.fn(),
            getDownloadUrl: jest.fn().mockResolvedValue({ downloadUrl: 'https://r2.test/signed/k', expiresAt: '1' }),
        };
        const generation = { submit: over.submit ?? jest.fn().mockResolvedValue({ jobId: 'j1', newBalance: 9 }) };
        const jobs = { activeByStorage: jest.fn().mockResolvedValue(over.running ?? null) };
        const locks = { acquire: jest.fn().mockResolvedValue(undefined), release: jest.fn().mockResolvedValue(undefined) };
        const service = new AIService(documents as never, generation as never, jobs as never, locks as never);
        return { service, documents, generation, jobs, locks };
    }

    it('rejects a request without a token before taking the lock', async () => {
        const { service, locks } = build();
        await expect(service.generateFromFile(user, file, dto, undefined)).rejects.toMatchObject({ status: 401 });
        expect(locks.acquire).not.toHaveBeenCalled();
    });

    it('creates the upload uncharged and reusable, then submits one job with the combined amount', async () => {
        const { service, documents, generation, locks } = build();

        const res = await service.generateFromFile(user, file, dto, 'tok');

        expect(documents.createUpload).toHaveBeenCalledWith(expect.objectContaining({ chargeCredits: false, reuseDuplicate: true }), expect.anything());
        expect(generation.submit).toHaveBeenCalledWith(expect.objectContaining({ storageId: 'd1', amount: 6, userId: 'u1', userToken: 'tok', type: 'quiz' }));
        expect(res).toMatchObject({ jobId: 'j1', status: 'PENDING', newBalance: 9 });
        expect(locks.release).not.toHaveBeenCalled(); // held until the job is terminal
    });

    it('a refused charge deletes the NEW upload and releases the lock; a reused upload is left alone', async () => {
        const refused = new ChargeRefusedException(new ConflictException('no credits'));
        const created = build({ submit: jest.fn().mockRejectedValue(refused) });
        await expect(created.service.generateFromFile(user, file, dto, 'tok')).rejects.toBe(refused);
        expect(created.documents.deleteDocuments).toHaveBeenCalledWith(['d1'], expect.anything());
        expect(created.locks.release).toHaveBeenCalledWith('u1', 'quiz');

        const reused = build({ upload: { reused: true }, submit: jest.fn().mockRejectedValue(refused) });
        await expect(reused.service.generateFromFile(user, file, dto, 'tok')).rejects.toBe(refused);
        expect(reused.documents.deleteDocuments).not.toHaveBeenCalled();
        expect(reused.locks.release).toHaveBeenCalledWith('u1', 'quiz');
    });

    it('an unknown debit outcome discards a NEW upload too (the reaper settles the job), but keeps a reused one', async () => {
        const unknown = new ChargeUnknownException(new ConflictException('unavailable'));
        const created = build({ submit: jest.fn().mockRejectedValue(unknown) });
        await expect(created.service.generateFromFile(user, file, dto, 'tok')).rejects.toBe(unknown);
        expect(created.documents.deleteDocuments).toHaveBeenCalledWith(['d1'], expect.anything());
        expect(created.locks.release).toHaveBeenCalledWith('u1', 'quiz');

        const reused = build({ upload: { reused: true }, submit: jest.fn().mockRejectedValue(unknown) });
        await expect(reused.service.generateFromFile(user, file, dto, 'tok')).rejects.toBe(unknown);
        expect(reused.documents.deleteDocuments).not.toHaveBeenCalled();
    });

    it('a failed cleanup does not hide the refusal', async () => {
        const refused = new ChargeRefusedException(new ConflictException('no credits'));
        const { service, documents } = build({ submit: jest.fn().mockRejectedValue(refused) });
        documents.deleteDocuments.mockRejectedValue(new Error('document down'));
        await expect(service.generateFromFile(user, file, dto, 'tok')).rejects.toBe(refused);
    });

    it('any other failure releases the lock and keeps the upload', async () => {
        const boom = new Error('db down');
        const { service, documents, locks } = build({ submit: jest.fn().mockRejectedValue(boom) });
        await expect(service.generateFromFile(user, file, dto, 'tok')).rejects.toBe(boom);
        expect(documents.deleteDocuments).not.toHaveBeenCalled();
        expect(locks.release).toHaveBeenCalledWith('u1', 'quiz');
    });

    it.each([
        ['FAILED', Status.DOCUMENT_PROCESSING_STATUS_FAILED],
        ['PENDING (quick-upload)', Status.DOCUMENT_PROCESSING_STATUS_PENDING],
    ])('a reused %s document re-queues its OCR before the job and submits the 5 credits', async (_label, processingStatus) => {
        const { service, documents, generation } = build({ upload: { reused: true, document: info({ processingStatus }) } });
        await service.generateFromFile(user, file, dto, 'tok');
        expect(documents.ensureProcessed).toHaveBeenCalledWith('d1', expect.anything());
        expect(generation.submit).toHaveBeenCalledWith(expect.objectContaining({ amount: 5 }));
        expect(documents.ensureProcessed.mock.invocationCallOrder[0]).toBeLessThan(generation.submit.mock.invocationCallOrder[0]);
    });

    it('M2: the job carries a presigned download URL and the mimetype of the document; no URL is not fatal', async () => {
        const { service, generation, documents } = build();
        await service.generateFromFile(user, file, dto, 'tok');
        expect(generation.submit).toHaveBeenCalledWith(
            expect.objectContaining({ download: { url: 'https://r2.test/signed/k', mimetype: 'application/pdf' } })
        );

        documents.getDownloadUrl.mockRejectedValue(new Error('document down'));
        await service.generateFromFile(user, file, dto, 'tok');
        expect(generation.submit).toHaveBeenLastCalledWith(expect.objectContaining({ download: undefined }));
    });

    it('a reused PROCESSING document with a running job returns that job and frees the lock', async () => {
        const { service, generation, locks } = build({
            upload: { reused: true, document: info({ processingStatus: Status.DOCUMENT_PROCESSING_STATUS_PROCESSING }) },
            running: { id: 'running-job' },
        });
        await expect(service.generateFromFile(user, file, dto, 'tok')).resolves.toMatchObject({ jobId: 'running-job', status: 'processing' });
        expect(generation.submit).not.toHaveBeenCalled();
        expect(locks.release).toHaveBeenCalledWith('u1', 'quiz');
    });

    it('rejects a 6 MB file and a quantity over 50 before any upload', async () => {
        const { service, documents, locks } = build();
        await expect(service.generateFromFile(user, { ...file, size: 6 * MB } as Express.Multer.File, dto, 'tok')).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.generateFromFile(user, file, { typeResult: '1', quantityQuizz: '51' } as never, 'tok')).rejects.toBeInstanceOf(BadRequestException);
        expect(documents.createUpload).not.toHaveBeenCalled();
        expect(locks.acquire).not.toHaveBeenCalled();
    });
});
