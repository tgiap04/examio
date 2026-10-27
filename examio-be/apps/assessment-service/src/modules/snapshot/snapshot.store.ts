import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { quizSnapshotSchema, type QuizSnapshotV1 } from './quiz-snapshot';
import { SnapshotCache } from './snapshot.cache';

/** The prisma client or an interactive transaction client (the row lock of attempt start / refresh). */
type SnapshotDb = Pick<PrismaService, 'examSession'>;

/**
 * The only reader of the `ExamSession.quizSnapshot` column. The column is omitted from every other
 * query (the client is built with a global `omit`, see PrismaService), so lists, caches and
 * includes never carry it; exam-time readers come here and hit the in-process LRU first.
 */
@Injectable()
export class SnapshotStore {
    private readonly logger = new Logger(SnapshotStore.name);
    private readonly cache = new SnapshotCache();

    constructor(private readonly prisma: PrismaService) {}

    /**
     * The snapshot of `sessionId`. `hash` is the session's `quizSnapshotHash` (a small column the
     * caller already read with the session): it names the cache entry, so a refreshed session can
     * never be served its old snapshot. Pass the transaction client when running under the row lock.
     */
    async load(sessionId: string, hash: string, db: SnapshotDb = this.prisma): Promise<QuizSnapshotV1> {
        const hit = this.cache.get(SnapshotCache.key(sessionId, hash));
        if (hit) return hit;
        const row = await db.examSession.findUnique({
            where: { id: sessionId },
            select: { quizSnapshot: true, quizSnapshotHash: true },
        });
        if (!row) throw new NotFoundException('Phiên thi không tồn tại');
        const parsed = quizSnapshotSchema.safeParse(row.quizSnapshot);
        if (!parsed.success) {
            this.logger.error(`Session ${sessionId} holds a malformed quiz snapshot: ${parsed.error.message}`);
            throw new InternalServerErrorException('Đề thi của phiên này không hợp lệ');
        }
        this.cache.set(SnapshotCache.key(sessionId, row.quizSnapshotHash), parsed.data);
        return parsed.data;
    }
}
