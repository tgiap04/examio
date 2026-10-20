import { PrismaService } from '@examio/database';

/**
 * Access to a quiz set from the set's own sharing fields ONLY: owner, public,
 * whitelisted, or unlocked with the current code. It never looks at the owner's
 * account, so a demoted owner's shared set stays practisable (decision
 * 2026-10-18). Do not join other tables here; `quizset-access.spec.ts` guards
 * that with a static check.
 */
export type QuizSetAccessKind = 'owner' | 'public' | 'whitelist' | 'code';

export interface QuizSetAccessRow {
    userId: string;
    isPublic: boolean;
    whitelist: string[];
    codeGrantedIds: string[];
}

/** Pure decision, shared by the DB lookup below and the practice service. */
export function accessKindOf(
    row: QuizSetAccessRow,
    userId?: string
): QuizSetAccessKind | null {
    if (userId && row.userId === userId) return 'owner';
    if (row.isPublic) return 'public';
    if (!userId) return null;
    if (row.whitelist.includes(userId)) return 'whitelist';
    if (row.codeGrantedIds.includes(userId)) return 'code';
    return null;
}

export const QUIZ_SET_ACCESS_SELECT = {
    userId: true,
    isPublic: true,
    whitelist: true,
    codeGrantedIds: true,
} as const;

/** One indexed `findFirst` with a narrow `select`; `false` for a missing set. */
export async function canAccessQuizSet(
    prisma: Pick<PrismaService, 'quizSet'>,
    quizSetId: string,
    userId: string | undefined
): Promise<boolean> {
    const row = await prisma.quizSet.findFirst({
        where: { id: quizSetId },
        select: QUIZ_SET_ACCESS_SELECT,
    });
    return row !== null && accessKindOf(row, userId) !== null;
}
