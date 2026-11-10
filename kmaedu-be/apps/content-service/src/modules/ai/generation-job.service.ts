import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { GenerateIdService } from '@kmaedu/common';
import { OutboxService } from '@kmaedu/messaging';
import { GenerationJob, PrismaService } from '../../prisma';
import { GenerationJobRepository } from './generation-job.repository';
import { GenerationLockService } from './generation-lock.service';
import {
    GenerationType,
    JobStatus,
    OPEN_STATUSES,
    IN_FLIGHT_STATUSES,
    resolveJobTimeoutMs,
    REAPER_BATCH,
} from './generation.constants';

export interface GenerationOptions {
    numItems: number;
    isNarrowSearch: boolean;
    keyword?: string;
}

export interface SubmitJobInput {
    userId: string;
    storageId: string;
    filename: string;
    type: GenerationType;
    options: GenerationOptions;
    /** Model id from the registry; empty = ai-service default. */
    model?: string;
    /**
     * Presigned GET of the document, so ai-service can process a document that has no chunks yet instead
     * of waiting for the OCR pipeline. Best effort: absent when document-service could not sign one.
     */
    download?: { url: string; mimetype: string };
}

export interface SubmittedJob {
    jobId: string;
}

/** What one reaper pass settled. */
export interface ReapResult {
    timedOut: number;
}

const notCancellable = () =>
    new ConflictException({ statusCode: 409, code: 'JOB_NOT_CANCELLABLE', message: 'Không thể hủy job đã hoàn thành hoặc thất bại' });

/**
 * The lifecycle of one generation job. `submit` inserts the job QUEUED together with its
 * `content.generation.requested` outbox row in ONE transaction, so a job never exists without the event
 * that makes ai-service work on it. Every later status change is conditional (see the repository), so the
 * result event, a cancel and the watchdog settle a job exactly once.
 */
@Injectable()
export class GenerationJobService {
    private readonly logger = new Logger(GenerationJobService.name);
    private readonly jobTimeoutMs = resolveJobTimeoutMs(process.env, this.logger);

    constructor(
        private readonly prisma: PrismaService,
        private readonly jobs: GenerationJobRepository,
        private readonly locks: GenerationLockService,
        private readonly outbox: OutboxService,
        private readonly ids: GenerateIdService
    ) {}

    async submit(input: SubmitJobInput): Promise<SubmittedJob> {
        const id = this.ids.generateId();
        await this.prisma.$transaction(async (tx) => {
            await this.jobs.insert(tx, {
                id,
                userId: input.userId,
                storageId: input.storageId,
                filename: input.filename,
                type: input.type,
                status: JobStatus.QUEUED,
                options: { ...input.options },
                model: input.model || undefined,
            });
            await this.outbox.add(tx, 'content.generation.requested', {
                jobId: id,
                userId: input.userId,
                storageId: input.storageId,
                type: input.type,
                options: {
                    numItems: input.options.numItems,
                    isNarrowSearch: input.options.isNarrowSearch,
                    ...(input.options.keyword ? { keyword: input.options.keyword } : {}),
                },
                model: input.model ?? '',
                ...(input.download ? { downloadUrl: input.download.url, mimetype: input.download.mimetype } : {}),
            });
        });
        return { jobId: id };
    }

    /** `DELETE job/:id`. CANCELLED is idempotent (a second call answers 200); COMPLETED / FAILED jobs are 409. */
    async cancel(job: GenerationJob): Promise<void> {
        if (await this.jobs.transition(this.prisma, job.id, OPEN_STATUSES, JobStatus.CANCELLED)) {
            await this.locks.releaseAfterTerminal(job);
            return;
        }
        const current = await this.jobs.findById(this.prisma, job.id);
        if (current?.status !== JobStatus.CANCELLED) throw notCancellable();
    }

    /**
     * Worker, every minute (the watchdog): a QUEUED / PROCESSING job nobody answered must not stay open
     * forever. A result that arrives later finds the job FAILED and is ignored by the conditional consumers.
     */
    async reap(now = new Date()): Promise<ReapResult> {
        let timedOut = 0;
        const silent = await this.jobs.findStuckInFlight(new Date(now.getTime() - this.jobTimeoutMs), REAPER_BATCH);
        for (const job of silent) {
            if (!(await this.jobs.transition(this.prisma, job.id, IN_FLIGHT_STATUSES, JobStatus.FAILED, { error: 'GENERATION_TIMEOUT' }))) continue;
            timedOut += 1;
            await this.locks.releaseAfterTerminal(job);
        }
        return { timedOut };
    }
}
