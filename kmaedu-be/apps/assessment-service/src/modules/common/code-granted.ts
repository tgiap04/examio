import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma';
import type { PrismaService } from '../../prisma';

/** One cap for each list (`whitelist`, `codeGrantedIds`) of a session. */
export const SHARE_LIST_CAP = 2000;

export class ShareListFullException extends ConflictException {
    constructor() {
        super({
            statusCode: 409,
            code: 'SHARE_LIST_FULL',
            message: `A sharing list holds at most ${SHARE_LIST_CAP} users`,
        });
    }
}

const appendOnce = (
    prisma: PrismaService,
    id: string,
    user: string,
    code: string | undefined
): Promise<number> =>
    prisma.$executeRaw(Prisma.sql`
        UPDATE "ExamSession" SET "codeGrantedIds" = array_append(COALESCE("codeGrantedIds", '{}'), ${user}::text)
        WHERE "id" = ${id}
          AND (${code ?? null}::text IS NULL OR "accessCode" = ${code ?? null}::text)
          AND NOT (${user}::text = ANY(COALESCE("codeGrantedIds", '{}')))
          AND cardinality(COALESCE("codeGrantedIds", '{}')) < ${SHARE_LIST_CAP}`);

/**
 * Remember that `user` unlocked the session's current code. Atomic and idempotent: the `WHERE`
 * rejects a present user and a full list, so two parallel unlocks add the id once. `expectedCode`
 * (the code that was just verified) must still be the stored one, so a rotation between the check
 * and the write can not grant access with the old code. 0 rows = already present (ok), full (409),
 * gone (404).
 */
export async function appendCodeGranted(
    prisma: PrismaService,
    sessionId: string,
    user: string,
    expectedCode?: string
): Promise<void> {
    // A second pass only matters when a rotate cleared the list between the update and the re-read.
    for (let pass = 0; pass < 2; pass++) {
        if ((await appendOnce(prisma, sessionId, user, expectedCode)) > 0) return;
        const row = await prisma.examSession.findFirst({
            where: { id: sessionId },
            select: { codeGrantedIds: true },
        });
        if (!row) throw new NotFoundException('Resource not found');
        if (row.codeGrantedIds.includes(user)) return;
        if (row.codeGrantedIds.length >= SHARE_LIST_CAP) throw new ShareListFullException();
    }
    throw new ConflictException({
        statusCode: 409,
        code: 'SHARING_CHANGED',
        message: 'Sharing settings changed, try again',
    });
}
