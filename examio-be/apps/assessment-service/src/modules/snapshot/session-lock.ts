import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../prisma';
import type { PrismaService } from '../../prisma';

/** A transaction client of the assessment database. */
export type SessionTx = Pick<PrismaService, '$queryRaw' | 'examSession' | 'examAttempt'>;

/**
 * `SELECT ... FOR UPDATE` on one session row, inside the caller's transaction. A refresh of the
 * snapshot and the start of a NEW attempt both take it first: whichever gets the row second waits,
 * then sees the other's committed effect. So there is never a started attempt next to a changed
 * snapshot. Returns `null` when the session does not exist.
 */
export async function lockSessionRow(tx: SessionTx, sessionId: string): Promise<{ status: number } | null> {
    const rows = await tx.$queryRaw<Array<{ status: number }>>(
        Prisma.sql`SELECT "status" FROM "ExamSession" WHERE "id" = ${sessionId} FOR UPDATE`
    );
    return rows[0] ?? null;
}

export class SnapshotLockedException extends ConflictException {
    constructor() {
        super({
            statusCode: 409,
            code: 'SNAPSHOT_LOCKED',
            message: 'Phiên thi đã bắt đầu hoặc đã có người làm bài, không thể cập nhật đề',
        });
    }
}
