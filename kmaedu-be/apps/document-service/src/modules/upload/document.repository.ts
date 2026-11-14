import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService, UserStorage } from '../../prisma';
import { DocumentStatus } from '../../config/document.constants';

type Db = PrismaService | Prisma.TransactionClient;

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

/**
 * Prisma access of UserStorage. Every user-facing read is scoped by `userId` (not-owned = not-found);
 * "visible" means owned by the caller (every row of the owner is visible to them).
 */
@Injectable()
export class DocumentRepository {
    constructor(private readonly prisma: PrismaService) {}

    insert(db: Db, data: NewDocument): Promise<UserStorage> {
        return db.userStorage.create({ data });
    }

    findByKey(keyR2: string): Promise<UserStorage | null> {
        return this.prisma.userStorage.findUnique({ where: { keyR2 } });
    }

    /** Any owner: for the event flows that already hold a vetted id. */
    findRaw(db: Db, id: string): Promise<UserStorage | null> {
        return db.userStorage.findUnique({ where: { id } });
    }

    findVisible(userId: string, id: string): Promise<UserStorage | null> {
        return this.prisma.userStorage.findFirst({ where: { id, userId } });
    }

    /** One query for any number of ids. */
    findVisibleByIds(db: Db, userId: string, ids: string[]): Promise<UserStorage[]> {
        return db.userStorage.findMany({ where: { id: { in: ids }, userId } });
    }

    listVisible(userId: string, page: number, size: number): Promise<UserStorage[]> {
        return this.prisma.userStorage.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * size,
            take: size,
        });
    }

    /** The caller's newest upload with the same `(filename, size)`. */
    findDuplicate(userId: string, filename: string, size: number): Promise<UserStorage | null> {
        return this.prisma.userStorage.findFirst({
            where: { userId, filename, size },
            orderBy: { createdAt: 'desc' },
        });
    }

    /** Uploads created since `since`. */
    countSince(userId: string, since: Date): Promise<number> {
        return this.prisma.userStorage.count({ where: { userId, createdAt: { gte: since } } });
    }

    countAll(userId: string): Promise<number> {
        return this.prisma.userStorage.count({ where: { userId } });
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
     * Deletes the owner's rows among `ids` in ONE statement and returns exactly what it
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
            RETURNING id, filename, "keyR2"`;
    }
}
