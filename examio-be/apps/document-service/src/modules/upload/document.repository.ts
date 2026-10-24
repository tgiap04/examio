import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService, UserStorage } from '../../prisma';
import { DocumentStatus } from '../../config/document.constants';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Rows the owner can see: not a charge that was refused or timed out, and not the PENDING_CHARGE
 * limbo between insert and debit (the row did not exist for the client before the extraction either).
 */
const VISIBLE: Prisma.UserStorageWhereInput = {
    chargeFailedAt: null,
    processingStatus: { not: DocumentStatus.PENDING_CHARGE },
};

export interface NewDocument {
    id: string;
    userId: string;
    filename: string;
    url: string;
    mimetype: string;
    size: number;
    keyR2: string;
    processingStatus: string;
    queuedAt?: Date;
}

/** Prisma access of UserStorage. Every user-facing read is scoped by `userId` (not-owned = not-found). */
@Injectable()
export class DocumentRepository {
    constructor(private readonly prisma: PrismaService) {}

    insert(db: Db, data: NewDocument): Promise<UserStorage> {
        return db.userStorage.create({ data });
    }

    findByKey(keyR2: string): Promise<UserStorage | null> {
        return this.prisma.userStorage.findUnique({ where: { keyR2 } });
    }

    /** Any state, any owner: for the charge/event flows that already hold a vetted id. */
    findRaw(db: Db, id: string): Promise<UserStorage | null> {
        return db.userStorage.findUnique({ where: { id } });
    }

    findVisible(userId: string, id: string): Promise<UserStorage | null> {
        return this.prisma.userStorage.findFirst({ where: { id, userId, ...VISIBLE } });
    }

    /** One query for any number of ids. */
    findVisibleByIds(db: Db, userId: string, ids: string[]): Promise<UserStorage[]> {
        return db.userStorage.findMany({ where: { id: { in: ids }, userId, ...VISIBLE } });
    }

    listVisible(userId: string, page: number, size: number): Promise<UserStorage[]> {
        return this.prisma.userStorage.findMany({
            where: { userId, ...VISIBLE },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * size,
            take: size,
        });
    }

    /** The caller's newest upload with the same `(filename, size)`. */
    findDuplicate(userId: string, filename: string, size: number): Promise<UserStorage | null> {
        return this.prisma.userStorage.findFirst({
            where: { userId, filename, size, ...VISIBLE },
            orderBy: { createdAt: 'desc' },
        });
    }

    /** Uploads accepted since `since` (charge refusals excluded: the user never got those files). */
    countSince(userId: string, since: Date): Promise<number> {
        return this.prisma.userStorage.count({
            where: { userId, chargeFailedAt: null, createdAt: { gte: since } },
        });
    }

    countAll(userId: string): Promise<number> {
        return this.prisma.userStorage.count({ where: { userId, ...VISIBLE } });
    }

    /** PENDING_CHARGE -> PENDING (credit confirmed). False when the row left PENDING_CHARGE meanwhile. */
    async confirmCharge(db: Db, id: string, creditCharged: boolean): Promise<boolean> {
        const { count } = await db.userStorage.updateMany({
            where: { id, processingStatus: DocumentStatus.PENDING_CHARGE },
            data: { processingStatus: DocumentStatus.PENDING, creditCharged, queuedAt: new Date() },
        });
        return count === 1;
    }

    /**
     * Claims one (re-)emission of `document.uploaded`: the row must still be in `from` with the same
     * `queuedAt` the caller read, so two racing callers emit once. FAILED rows go back to PENDING.
     */
    async claimRequeue(db: Db, row: UserStorage): Promise<boolean> {
        const { count } = await db.userStorage.updateMany({
            where: { id: row.id, processingStatus: row.processingStatus, queuedAt: row.queuedAt },
            data: { processingStatus: DocumentStatus.PENDING, queuedAt: new Date() },
        });
        return count === 1;
    }

    /**
     * PENDING_CHARGE -> FAILED with `chargeFailedAt`: the one claim that decides who may compensate the
     * row. `refundOwed` false (a definitive refusal: nothing was taken) settles the refund at once; true
     * leaves `refundSettledAt` null for the refund bookkeeping. False when someone else moved the row
     * first (a concurrent request confirmed it, or the reaper failed it).
     */
    async claimFailed(db: Db, id: string, now: Date, refundOwed: boolean): Promise<boolean> {
        const { count } = await db.userStorage.updateMany({
            where: { id, processingStatus: DocumentStatus.PENDING_CHARGE },
            data: {
                processingStatus: DocumentStatus.FAILED,
                chargeFailedAt: now,
                refundSettledAt: refundOwed ? null : now,
            },
        });
        return count === 1;
    }

    /** Records that the compensation of a charge-failed row is done. Idempotent. */
    async markRefundSettled(db: Db, id: string, now: Date): Promise<void> {
        await db.userStorage.updateMany({ where: { id, refundSettledAt: null }, data: { refundSettledAt: now } });
    }

    /** Charge-failed rows failed before `failedBefore` whose refund is not settled yet, oldest first. */
    findOpenRefunds(failedBefore: Date, limit: number): Promise<UserStorage[]> {
        return this.prisma.userStorage.findMany({
            where: { chargeFailedAt: { not: null, lt: failedBefore }, refundSettledAt: null },
            orderBy: { chargeFailedAt: 'asc' },
            take: limit,
        });
    }

    /** Rows stuck in PENDING_CHARGE since before `before`, oldest first. */
    findStuckCharges(before: Date, limit: number): Promise<UserStorage[]> {
        return this.prisma.userStorage.findMany({
            where: { processingStatus: DocumentStatus.PENDING_CHARGE, chargeFailedAt: null, createdAt: { lt: before } },
            orderBy: { createdAt: 'asc' },
            take: limit,
        });
    }

    /**
     * Deletes the owner's visible rows among `ids` in ONE statement and returns exactly what it
     * removed, so a concurrent delete can never be reported (or announced) twice.
     */
    deleteVisible(
        db: Db,
        userId: string,
        ids: string[]
    ): Promise<Array<{ id: string; filename: string; keyR2: string }>> {
        return db.$queryRaw`
            DELETE FROM "UserStorage"
            WHERE id = ANY(${ids}::text[]) AND "userId" = ${userId}
              AND "chargeFailedAt" IS NULL AND "processingStatus" <> ${DocumentStatus.PENDING_CHARGE}
            RETURNING id, filename, "keyR2"`;
    }
}
