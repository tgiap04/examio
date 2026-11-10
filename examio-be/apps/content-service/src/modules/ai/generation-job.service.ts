import { ConflictException, HttpException, Injectable, Logger } from '@nestjs/common';
import { GenerateIdService } from '@examio/common';
import { OutboxService } from '@examio/messaging';
import { GenerationJob, PrismaService } from '../../prisma';
import { GenerationChargeService } from './generation-charge.service';
import { GenerationJobRepository } from './generation-job.repository';
import { GenerationLockService } from './generation-lock.service';
import {
    GenerationType,
    JobStatus,
    OPEN_STATUSES,
    PENDING_CHARGE_TIMEOUT_MS,
    IN_FLIGHT_STATUSES,
    resolveJobTimeoutMs,
    REAPER_BATCH,
    REFUND_SWEEP_GRACE_MS,
} from './generation.constants';

export interface GenerationOptions {
    numItems: number;
    isNarrowSearch: boolean;
    keyword?: string;
}

export interface SubmitJobInput {
    userId: string;
    userToken: string;
    storageId: string;
    filename: string;
    type: GenerationType;
    options: GenerationOptions;
    /** Model id from the registry; empty = ai-service default. */
    model?: string;
    /** Credits for the whole job (0 = nothing to charge). */
    amount: number;
    /** Finance transaction reason. */
    reason: string;
    /**
     * Presigned GET of the document, so ai-service can process a document that has no chunks yet instead
     * of waiting for the OCR pipeline. Best effort: absent when document-service could not sign one.
     */
    download?: { url: string; mimetype: string };
}

export interface SubmittedJob {
    jobId: string;
    newBalance?: number;
}

/** What one reaper pass settled. */
export interface ReapResult {
    cancelled: number;
    timedOut: number;
    refunded: number;
}

/** Finance refused the debit (insufficient credits / no wallet): nothing was taken and nothing was queued. */
export class ChargeRefusedException extends HttpException {
    constructor(cause: HttpException) {
        super(cause.getResponse(), cause.getStatus());
    }
}

/**
 * The debit's outcome is unknown (finance did not answer): the job stays PENDING_CHARGE for the reaper,
 * and the request answers 403 CHARGE_UNAVAILABLE. Distinct from a refusal only so the caller can discard
 * an upload that was stored for this request alone.
 */
export class ChargeUnknownException extends HttpException {
    constructor(cause: HttpException) {
        super(cause.getResponse(), cause.getStatus());
    }
}

/** The job was cancelled while its request was between the debit and the queueing tx. */
const jobCancelled = () =>
    new ConflictException({ statusCode: 409, code: 'JOB_CANCELLED', message: 'Tác vụ đã bị hủy trước khi được xếp hàng, tín dụng đã được hoàn lại.' });
const notCancellable = () =>
    new ConflictException({ statusCode: 409, code: 'JOB_NOT_CANCELLABLE', message: 'Không thể hủy job đã hoàn thành hoặc thất bại' });

/**
 * The crash-safe charge flow of one generation job (idempotent on `gen:<jobId>`):
 *
 *   (1) tx: insert the job as PENDING_CHARGE, commit
 *   (2) Debit(gen:<jobId>) as the user                (skipped when the job is free)
 *   (3) tx: PENDING_CHARGE -> QUEUED (conditional) + outbox `content.generation.requested`
 *
 * A crash anywhere leaves either nothing charged, or a PENDING_CHARGE job the reaper cancels and
 * refunds. A cancel that lands between (2) and (3) makes (3) update 0 rows: the request refunds and
 * answers 409. Refunds are recorded in `refundedAt` and swept until confirmed.
 */
@Injectable()
export class GenerationJobService {
    private readonly logger = new Logger(GenerationJobService.name);
    private readonly jobTimeoutMs = resolveJobTimeoutMs(process.env, this.logger);

    constructor(
        private readonly prisma: PrismaService,
        private readonly jobs: GenerationJobRepository,
        private readonly charge: GenerationChargeService,
        private readonly locks: GenerationLockService,
        private readonly outbox: OutboxService,
        private readonly ids: GenerateIdService
    ) {}

    async submit(input: SubmitJobInput): Promise<SubmittedJob> {
        const id = this.ids.generateId();
        const job = await this.jobs.insert(this.prisma, {
            id,
            userId: input.userId,
            storageId: input.storageId,
            filename: input.filename,
            type: input.type,
            status: JobStatus.PENDING_CHARGE,
            chargeKey: `gen:${id}`,
            chargedAmount: input.amount,
            options: { ...input.options },
            model: input.model || undefined,
        });

        let newBalance: number | undefined;
        if (input.amount > 0) {
            const outcome = await this.charge.debit(job, input.reason, input.userToken);
            if (outcome.kind === 'refused') {
                // Definitive: no money moved, so there is nothing to refund and nothing to sweep.
                await this.jobs.transition(this.prisma, id, OPEN_STATUSES, JobStatus.FAILED, { error: outcome.error.message });
                await this.jobs.markRefunded(this.prisma, id, new Date(), true);
                throw new ChargeRefusedException(outcome.error);
            }
            // Unknown: the job stays PENDING_CHARGE and the reaper settles it (cancel + idempotent refund).
            if (outcome.kind === 'unknown') throw new ChargeUnknownException(outcome.error);
            newBalance = outcome.newBalance;
        }

        if (!(await this.queue(job, input))) {
            await this.charge.refund(job, this.prisma);
            throw jobCancelled();
        }
        return { jobId: id, newBalance };
    }

    /** Step (3). False when the job left PENDING_CHARGE (cancelled) in the meantime. */
    private queue(job: GenerationJob, input: SubmitJobInput): Promise<boolean> {
        return this.prisma.$transaction(async (tx) => {
            if (!(await this.jobs.transition(tx, job.id, [JobStatus.PENDING_CHARGE], JobStatus.QUEUED))) return false;
            await this.outbox.add(tx, 'content.generation.requested', {
                jobId: job.id,
                userId: job.userId,
                storageId: job.storageId,
                type: job.type,
                options: {
                    numItems: input.options.numItems,
                    isNarrowSearch: input.options.isNarrowSearch,
                    ...(input.options.keyword ? { keyword: input.options.keyword } : {}),
                },
                model: input.model ?? '',
                ...(input.download ? { downloadUrl: input.download.url, mimetype: input.download.mimetype } : {}),
            });
            return true;
        });
    }

    /**
     * `DELETE job/:id`. CANCELLED is idempotent (a second call answers 200 and finishes an open refund
     * without calling finance again once it is settled); COMPLETED / FAILED jobs are 409.
     */
    async cancel(job: GenerationJob): Promise<void> {
        if (await this.jobs.transition(this.prisma, job.id, OPEN_STATUSES, JobStatus.CANCELLED)) {
            await this.locks.releaseAfterTerminal(job);
            await this.settleRefund(job.id);
            return;
        }
        const current = await this.jobs.findById(this.prisma, job.id);
        if (current?.status !== JobStatus.CANCELLED) throw notCancellable();
        if (!current.refundedAt) await this.settleRefund(current.id);
    }

    /** Worker, every minute: cancel + refund abandoned PENDING_CHARGE jobs, fail + refund jobs ai-service never answered, then finish open refunds. */
    async reap(now = new Date()): Promise<ReapResult> {
        let cancelled = 0;
        let timedOut = 0;
        let refunded = 0;
        const stuck = await this.jobs.findStuckPending(new Date(now.getTime() - PENDING_CHARGE_TIMEOUT_MS), REAPER_BATCH);
        for (const job of stuck) {
            if (!(await this.jobs.transition(this.prisma, job.id, [JobStatus.PENDING_CHARGE], JobStatus.CANCELLED, { error: 'CHARGE_TIMEOUT' }))) continue;
            cancelled += 1;
            await this.locks.releaseAfterTerminal(job);
            // Ten minutes on, no debit of this job can still be in flight: NOT_FOUND means it never happened.
            if (await this.settleRefund(job.id, true)) refunded += 1;
        }
        // Watchdog: a charged job nobody answered must not stay QUEUED (and charged) forever. A result that
        // arrives later finds the job FAILED and is ignored by the conditional consumers (no history, no
        // second refund: the refund key is `gen:<id>`).
        const silent = await this.jobs.findStuckInFlight(new Date(now.getTime() - this.jobTimeoutMs), REAPER_BATCH);
        for (const job of silent) {
            if (!(await this.jobs.transition(this.prisma, job.id, IN_FLIGHT_STATUSES, JobStatus.FAILED, { error: 'GENERATION_TIMEOUT' }))) continue;
            timedOut += 1;
            await this.locks.releaseAfterTerminal(job);
            if (await this.settleRefund(job.id)) refunded += 1;
        }
        const open = await this.jobs.findUnrefunded(new Date(now.getTime() - REFUND_SWEEP_GRACE_MS), REAPER_BATCH);
        for (const job of open) {
            if (await this.settleRefund(job.id, true)) refunded += 1;
        }
        return { cancelled, timedOut, refunded };
    }

    /** Re-reads the job (its status just changed) and runs the refund; never throws. */
    private async settleRefund(jobId: string, settleNotFound = false): Promise<boolean> {
        try {
            const job = await this.jobs.findById(this.prisma, jobId);
            return job ? await this.charge.refund(job, this.prisma, settleNotFound) : false;
        } catch (error) {
            this.logger.error(`Refund of job ${jobId} failed, the sweeper retries: ${(error as Error).message}`);
            return false;
        }
    }
}
