import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { GenerateIdService } from '@examio/common';
import { Envelope, EventHandler, PermanentEventError } from '@examio/messaging';
import { GenerationJob, Prisma, PrismaService } from '../../prisma';
import { GenerationChargeService } from './generation-charge.service';
import { GenerationJobRepository } from './generation-job.repository';
import { GenerationLockService } from './generation-lock.service';
import { IN_FLIGHT_STATUSES, JobStatus } from './generation.constants';

/** `examio.events.v1.AiGenerationCompleted` (JSON uses the camelCase field names). */
const completedSchema = z.object({
    jobId: z.string().min(1),
    type: z.enum(['quiz', 'flashcard']),
    items: z.object({
        quizzes: z
            .array(
                z.object({
                    question: z.string(),
                    options: z.array(z.string()),
                    answer: z.string(),
                    sourcePageRange: z.string().optional().default(''),
                })
            )
            .default([]),
        flashcards: z
            .array(
                z.object({
                    question: z.string(),
                    answer: z.string(),
                    sourcePageRange: z.string().optional().default(''),
                })
            )
            .default([]),
    }),
});

/** `examio.events.v1.AiGenerationFailed`. */
const failedSchema = z.object({ jobId: z.string().min(1), reason: z.string().default('GENERATION_FAILED') });

/** `examio.events.v1.DocumentDeleted`. */
const deletedSchema = z.object({ storageIds: z.array(z.string()).default([]), userId: z.string().min(1) });

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, envelope: Envelope): T {
    const parsed = schema.safeParse(envelope.data);
    if (!parsed.success) {
        throw new PermanentEventError('INVALID_DATA', `${envelope.type} payload is invalid`);
    }
    return parsed.data;
}

/**
 * Consumers of `exam.events` for generation and document lifecycle. Every one is idempotent on its own
 * (conditional status updates, deleteMany / updateMany), so a replayed delivery changes nothing.
 */
@Injectable()
export class GenerationEventsHandler {
    private readonly logger = new Logger(GenerationEventsHandler.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly jobs: GenerationJobRepository,
        private readonly charge: GenerationChargeService,
        private readonly locks: GenerationLockService,
        private readonly ids: GenerateIdService
    ) {}

    /**
     * QUEUED / PROCESSING -> COMPLETED and the generated history, in ONE transaction of its own. A job that
     * was cancelled (or already settled) meanwhile ignores the result: no history is written. No idempotency
     * tx from the consumer: the conditional transition is the idempotency (a replay finds the job settled),
     * and the generation lock (Redis) is released only AFTER this transaction committed, never inside it:
     * a rollback must not free the lock of a job that is still in flight.
     */
    @EventHandler('ai.generation.completed', { dedupe: false })
    async onCompleted(envelope: Envelope): Promise<void> {
        const data = parse(completedSchema, envelope);
        const settled = await this.prisma.$transaction((tx) => this.settleCompleted(tx, data));
        if (settled) await this.locks.releaseAfterTerminal(settled);
    }

    /** Returns the job this delivery moved to a terminal state, or null when it changed nothing. */
    private async settleCompleted(tx: Prisma.TransactionClient, data: z.infer<typeof completedSchema>): Promise<GenerationJob | null> {
        const job = await this.jobs.findById(tx, data.jobId);
        if (!job) {
            this.logger.warn(`ai.generation.completed for unknown job ${data.jobId}, ignored`);
            return null;
        }
        const items = job.type === 'flashcard' ? data.items.flashcards : data.items.quizzes;
        if (items.length === 0) {
            // ai-service never reports an empty success; treat it as a failure. The refund is left to the
            // sweeper: no network call runs inside this DB transaction.
            return (await this.jobs.transition(tx, job.id, IN_FLIGHT_STATUSES, JobStatus.FAILED, { error: 'GENERATION_FAILED' }))
                ? job
                : null;
        }
        const historyId = this.ids.generateId();
        if (!(await this.jobs.transition(tx, job.id, IN_FLIGHT_STATUSES, JobStatus.COMPLETED, { historyId }))) {
            this.logger.log(`ai.generation.completed for job ${job.id} in ${job.status}, ignored`);
            return null;
        }
        const history = { id: historyId, userId: job.userId, storageId: job.storageId, items };
        if (job.type === 'flashcard') await this.jobs.createFlashcardHistory(tx, history);
        else await this.jobs.createQuizHistory(tx, history);
        return job;
    }

    /**
     * QUEUED / PROCESSING -> FAILED, then the refund. No idempotency tx: the refund is a network call that
     * must not run inside a DB transaction; a replay finds the job already FAILED, and a refund that did
     * not complete stays open (`refundedAt` null) for the sweeper.
     */
    @EventHandler('ai.generation.failed', { dedupe: false })
    async onFailed(envelope: Envelope): Promise<void> {
        const data = parse(failedSchema, envelope);
        await this.fail(data.jobId, data.reason);
    }

    /** The documents are gone: generated history keeps its rows but loses the link (ai-chat removes its own links). */
    @EventHandler('document.deleted')
    async onDocumentDeleted(envelope: Envelope, tx: Prisma.TransactionClient): Promise<void> {
        const { storageIds, userId } = parse(deletedSchema, envelope);
        if (storageIds.length === 0) return;
        await this.jobs.detachHistory(tx, userId, storageIds);
    }

    private async fail(jobId: string, reason: string): Promise<void> {
        const job = await this.jobs.findById(this.prisma, jobId);
        if (!job) {
            this.logger.warn(`ai.generation.failed for unknown job ${jobId}, ignored`);
            return;
        }
        if (!(await this.jobs.transition(this.prisma, jobId, IN_FLIGHT_STATUSES, JobStatus.FAILED, { error: reason }))) {
            this.logger.log(`ai.generation.failed for job ${jobId} in ${job.status}, ignored`);
            return;
        }
        await this.locks.releaseAfterTerminal(job);
        try {
            await this.charge.refund(job, this.prisma);
        } catch (error) {
            this.logger.error(`Refund of failed job ${jobId} did not complete, the sweeper retries: ${(error as Error).message}`);
        }
    }
}
