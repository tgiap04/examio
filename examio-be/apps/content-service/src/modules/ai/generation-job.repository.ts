import { Injectable } from '@nestjs/common';
import { GenerationJob, Prisma, PrismaService } from '../../prisma';
import { IN_FLIGHT_STATUSES, JobStatus, JobStatusValue, OPEN_STATUSES, REFUNDABLE_STATUSES } from './generation.constants';

type Db = PrismaService | Prisma.TransactionClient;

export interface NewJob {
    id: string;
    userId: string;
    storageId: string;
    filename: string;
    type: string;
    status: JobStatusValue;
    chargeKey: string;
    chargedAmount: number;
    options: Prisma.InputJsonValue;
    model?: string;
}

/** Latest generated quiz / flashcard summary of a document (item counts computed in SQL). */
export interface HistorySummary {
    storageId: string;
    kind: 'quiz' | 'flashcard';
    id: string;
    createdAt: Date;
    count: number;
}

/**
 * Prisma access for `GenerationJob` and the generated history. Every status change is ONE conditional
 * `updateMany` (`where status in <from>`), so two racing paths (event, cancel, reaper) settle a job once.
 */
@Injectable()
export class GenerationJobRepository {
    constructor(private readonly prisma: PrismaService) {}

    insert(db: Db, job: NewJob): Promise<GenerationJob> {
        return db.generationJob.create({ data: job });
    }

    findById(db: Db, id: string): Promise<GenerationJob | null> {
        return db.generationJob.findUnique({ where: { id } });
    }

    findOwned(id: string, userId: string): Promise<GenerationJob | null> {
        return this.prisma.generationJob.findFirst({ where: { id, userId } });
    }

    /** The newest job of a document (`GET job/:id` with a storage id keeps old clients working). */
    latestByStorage(storageId: string, userId: string): Promise<GenerationJob | null> {
        return this.prisma.generationJob.findFirst({
            where: { storageId, userId },
            orderBy: { createdAt: 'desc' },
        });
    }

    /** A job of the document that has not reached a terminal state. */
    activeByStorage(storageId: string, userId: string, type: string): Promise<GenerationJob | null> {
        return this.prisma.generationJob.findFirst({
            where: { storageId, userId, type, status: { in: [JobStatus.QUEUED, JobStatus.PROCESSING] } },
            orderBy: { createdAt: 'desc' },
        });
    }

    /** True when the user has another job of this type that is not terminal (it owns the generation lock). */
    async hasOpenJob(userId: string, type: string, excludingId: string): Promise<boolean> {
        const open = await this.prisma.generationJob.findFirst({
            where: { userId, type, id: { not: excludingId }, status: { in: [...OPEN_STATUSES] } },
            select: { id: true },
        });
        return open !== null;
    }

    /** `from` -> `to`; false when the job was not in `from` any more. */
    async transition(
        db: Db,
        id: string,
        from: readonly JobStatusValue[],
        to: JobStatusValue,
        extra: { error?: string; historyId?: string } = {}
    ): Promise<boolean> {
        const { count } = await db.generationJob.updateMany({
            where: { id, status: { in: [...from] } },
            data: { status: to, ...extra },
        });
        return count === 1;
    }

    /**
     * Records that the refund of a FAILED / CANCELLED job is done (or never needed). `neverCharged` also
     * zeroes `chargedAmount`: no money ever moved, so the job must not read as "charged, then failed"
     * (bookkeeping: it must not read as charged).
     */
    async markRefunded(db: Db, id: string, at = new Date(), neverCharged = false): Promise<void> {
        await db.generationJob.updateMany({
            where: { id, refundedAt: null },
            data: { refundedAt: at, ...(neverCharged ? { chargedAmount: 0 } : {}) },
        });
    }

    /** PENDING_CHARGE jobs older than `before`: their request thread is long gone. */
    findStuckPending(before: Date, limit: number): Promise<GenerationJob[]> {
        return this.prisma.generationJob.findMany({
            where: { status: JobStatus.PENDING_CHARGE, createdAt: { lt: before } },
            orderBy: { createdAt: 'asc' },
            take: limit,
        });
    }

    /** QUEUED / PROCESSING jobs whose last status change is older than `before`: nobody answered them. */
    findStuckInFlight(before: Date, limit: number): Promise<GenerationJob[]> {
        return this.prisma.generationJob.findMany({
            where: { status: { in: [...IN_FLIGHT_STATUSES] }, updatedAt: { lt: before } },
            orderBy: { updatedAt: 'asc' },
            take: limit,
        });
    }

    /** FAILED / CANCELLED jobs that were charged and whose refund is not confirmed yet. */
    findUnrefunded(settledBefore: Date, limit: number): Promise<GenerationJob[]> {
        return this.prisma.generationJob.findMany({
            where: {
                status: { in: [...REFUNDABLE_STATUSES] },
                chargedAmount: { gt: 0 },
                refundedAt: null,
                updatedAt: { lt: settledBefore },
            },
            orderBy: { updatedAt: 'asc' },
            take: limit,
        });
    }

    createQuizHistory(db: Db, data: { id: string; userId: string; storageId: string; items: Prisma.InputJsonValue }) {
        return db.historyGeneratedQuizz.create({
            data: { id: data.id, userId: data.userId, userStorageId: data.storageId, quizzes: data.items },
        });
    }

    createFlashcardHistory(db: Db, data: { id: string; userId: string; storageId: string; items: Prisma.InputJsonValue }) {
        return db.historyGeneratedFlashcard.create({
            data: { id: data.id, userId: data.userId, userStorageId: data.storageId, flashcards: data.items },
        });
    }

    findQuizHistory(id: string) {
        return this.prisma.historyGeneratedQuizz.findUnique({ where: { id } });
    }

    findFlashcardHistory(id: string) {
        return this.prisma.historyGeneratedFlashcard.findUnique({ where: { id } });
    }

    latestQuizHistory(storageId: string, userId: string) {
        return this.prisma.historyGeneratedQuizz.findFirst({
            where: { userStorageId: storageId, userId },
            orderBy: { createdAt: 'desc' },
        });
    }

    latestFlashcardHistory(storageId: string, userId: string) {
        return this.prisma.historyGeneratedFlashcard.findFirst({
            where: { userStorageId: storageId, userId },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * The newest quiz and the newest flashcard history of every document, in ONE query, with the item
     * count computed in SQL (no JSON blob is loaded to count it).
     */
    historySummaries(userId: string, storageIds: string[]): Promise<HistorySummary[]> {
        if (storageIds.length === 0) return Promise.resolve([]);
        return this.prisma.$queryRaw<HistorySummary[]>`
            SELECT * FROM (
                SELECT DISTINCT ON ("userStorageId")
                    "userStorageId" AS "storageId", 'quiz' AS kind, id, "createdAt",
                    CASE WHEN jsonb_typeof(quizzes) = 'array' THEN jsonb_array_length(quizzes) ELSE 0 END::int AS count
                FROM "HistoryGeneratedQuizz"
                WHERE "userId" = ${userId} AND "userStorageId" = ANY(${storageIds}::text[])
                ORDER BY "userStorageId", "createdAt" DESC
            ) q
            UNION ALL
            SELECT * FROM (
                SELECT DISTINCT ON ("userStorageId")
                    "userStorageId" AS "storageId", 'flashcard' AS kind, id, "createdAt",
                    CASE WHEN jsonb_typeof(flashcards) = 'array' THEN jsonb_array_length(flashcards) ELSE 0 END::int AS count
                FROM "HistoryGeneratedFlashcard"
                WHERE "userId" = ${userId} AND "userStorageId" = ANY(${storageIds}::text[])
                ORDER BY "userStorageId", "createdAt" DESC
            ) f`;
    }

    /** `document.deleted`: generated history stays but loses its link (what ON DELETE SET NULL did). */
    async detachHistory(db: Db, userId: string, storageIds: string[]): Promise<void> {
        const where = { userId, userStorageId: { in: storageIds } };
        await db.historyGeneratedQuizz.updateMany({ where, data: { userStorageId: null } });
        await db.historyGeneratedFlashcard.updateMany({ where, data: { userStorageId: null } });
    }
}
