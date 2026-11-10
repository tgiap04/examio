import { ConflictException } from '@nestjs/common';
import { GenerationJobService, SubmitJobInput } from './generation-job.service';
import { JobStatus } from './generation.constants';

const job = (over: Record<string, unknown> = {}) => ({
    id: 'j1',
    userId: 'u1',
    storageId: 'd1',
    filename: 'a.pdf',
    type: 'quiz',
    status: JobStatus.QUEUED,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
});

const input = {
    userId: 'u1',
    storageId: 'd1',
    filename: 'a.pdf',
    type: 'quiz',
    options: { numItems: 10, isNarrowSearch: false },
    model: 'm1',
    download: { url: 'https://r2.test/signed', mimetype: 'application/pdf' },
};

function build() {
    const tx = { tag: 'tx' };
    const prisma = { $transaction: jest.fn(async (fn: (db: unknown) => unknown) => fn(tx)) };
    const jobs = {
        insert: jest.fn(async (_db: unknown, row: Record<string, unknown>) => job(row)),
        transition: jest.fn().mockResolvedValue(true),
        findById: jest.fn().mockResolvedValue(null),
        findStuckInFlight: jest.fn().mockResolvedValue([]),
    };
    const locks = { releaseAfterTerminal: jest.fn().mockResolvedValue(undefined) };
    const outbox = { add: jest.fn().mockResolvedValue(undefined) };
    const ids = { generateId: () => 'j1' };
    const service = new GenerationJobService(prisma as never, jobs as never, locks as never, outbox as never, ids as never);
    return { service, tx, prisma, jobs, locks, outbox };
}

describe('GenerationJobService.submit', () => {
    it('inserts the job QUEUED and its outbox row in ONE transaction, with no charge', async () => {
        const h = build();

        await expect(h.service.submit(input as SubmitJobInput)).resolves.toEqual({ jobId: 'j1' });

        expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(h.jobs.insert).toHaveBeenCalledTimes(1);
        expect(h.jobs.insert).toHaveBeenCalledWith(h.tx, expect.objectContaining({ id: 'j1', status: JobStatus.QUEUED }));
        const row = h.jobs.insert.mock.calls[0][1];
        expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['chargeKey']));
        expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['chargedAmount']));
        expect(h.outbox.add).toHaveBeenCalledWith(
            h.tx,
            'content.generation.requested',
            expect.objectContaining({
                jobId: 'j1',
                userId: 'u1',
                storageId: 'd1',
                type: 'quiz',
                model: 'm1',
                downloadUrl: 'https://r2.test/signed',
                mimetype: 'application/pdf',
                options: { numItems: 10, isNarrowSearch: false },
            })
        );
    });

    it('a failed outbox write rolls the whole submit back (nothing is left QUEUED without its event)', async () => {
        const h = build();
        h.outbox.add.mockRejectedValue(new Error('db down'));
        await expect(h.service.submit(input as SubmitJobInput)).rejects.toThrow('db down');
        expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(h.jobs.transition).not.toHaveBeenCalled();
    });
});

describe('GenerationJobService.cancel', () => {
    it('QUEUED -> CANCELLED releases the lock and touches no money', async () => {
        const h = build();
        await h.service.cancel(job() as never);
        expect(h.jobs.transition).toHaveBeenCalledWith(
            expect.anything(),
            'j1',
            [JobStatus.QUEUED, JobStatus.PROCESSING],
            JobStatus.CANCELLED
        );
        expect(h.locks.releaseAfterTerminal).toHaveBeenCalledTimes(1);
    });

    it('an already CANCELLED job answers 200 again without a second transition side effect', async () => {
        const h = build();
        h.jobs.transition.mockResolvedValue(false);
        h.jobs.findById.mockResolvedValue(job({ status: JobStatus.CANCELLED }));
        await expect(h.service.cancel(job() as never)).resolves.toBeUndefined();
        expect(h.locks.releaseAfterTerminal).not.toHaveBeenCalled();
    });

    it('a COMPLETED or FAILED job is 409', async () => {
        for (const status of [JobStatus.COMPLETED, JobStatus.FAILED]) {
            const h = build();
            h.jobs.transition.mockResolvedValue(false);
            h.jobs.findById.mockResolvedValue(job({ status }));
            await expect(h.service.cancel(job() as never)).rejects.toBeInstanceOf(ConflictException);
        }
    });
});

describe('GenerationJobService.reap', () => {
    it('is the watchdog only: silent QUEUED / PROCESSING jobs fail with GENERATION_TIMEOUT and free their lock', async () => {
        const h = build();
        h.jobs.findStuckInFlight.mockResolvedValue([job({ id: 'j1' }), job({ id: 'j2' })]);
        h.jobs.transition.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

        await expect(h.service.reap(new Date())).resolves.toEqual({ timedOut: 1 });

        expect(h.jobs.transition).toHaveBeenCalledWith(
            expect.anything(),
            'j1',
            [JobStatus.QUEUED, JobStatus.PROCESSING],
            JobStatus.FAILED,
            { error: 'GENERATION_TIMEOUT' }
        );
        expect(h.locks.releaseAfterTerminal).toHaveBeenCalledTimes(1);
    });
});
