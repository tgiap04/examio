import { PrismaService } from '../../prisma';

/**
 * Access to a flashcard set from the set's own sharing fields ONLY: public,
 * owner, whitelisted, or unlocked with the current code. It never looks at the owner's account, so a demoted
 * owner's shared set stays studyable (decision 2026-10-18). Do not join other
 * tables here; `flashcardset-access.spec.ts` guards that with a static check.
 */
export type FlashcardSetAccessKind = 'public' | 'owner' | 'whitelist' | 'code';

export interface FlashcardSetAccessRow {
    userId: string;
    isPublic: boolean;
    whitelist: string[];
    /** Users who unlocked the CURRENT code; cleared whenever the code changes. */
    codeGrantedIds: string[];
}

/** Pure decision, shared by the DB lookup below and `checkAccess`. */
export function accessKindOf(
    row: FlashcardSetAccessRow,
    userId?: string
): FlashcardSetAccessKind | null {
    if (row.isPublic) return 'public';
    if (!userId) return null;
    if (row.userId === userId) return 'owner';
    if (row.whitelist.includes(userId)) return 'whitelist';
    if (row.codeGrantedIds.includes(userId)) return 'code';
    return null;
}

/** One indexed `findFirst` with a narrow `select`; `false` for a missing set. */
export async function canAccessFlashcardSet(
    prisma: Pick<PrismaService, 'flashCardSet'>,
    flashCardSetId: string,
    userId: string | undefined
): Promise<boolean> {
    const row = await prisma.flashCardSet.findFirst({
        where: { id: flashCardSetId },
        select: {
            userId: true,
            isPublic: true,
            whitelist: true,
            codeGrantedIds: true,
        },
    });
    return row !== null && accessKindOf(row, userId) !== null;
}
