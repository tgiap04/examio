import { readFileSync } from 'fs';
import { join } from 'path';
import { accessKindOf, canAccessFlashcardSet } from './flashcardset-access';

const row = (
    over: Partial<{
        userId: string;
        isPublic: boolean;
        whitelist: string[];
        codeGrantedIds: string[];
    }> = {}
) => ({
    userId: 'owner',
    isPublic: false,
    whitelist: ['w'],
    codeGrantedIds: ['c'],
    ...over,
});

describe('flashcard set access', () => {
    it.each([
        [row({ isPublic: true }), undefined, 'public'],
        [row(), 'owner', 'owner'],
        [row(), 'w', 'whitelist'],
        [row(), 'c', 'code'],
        [row(), 'stranger', null],
        [row(), undefined, null],
    ])('accessKindOf(%j, %p) = %p', (r, userId, expected) => {
        expect(accessKindOf(r, userId)).toBe(expected);
    });

    it('canAccessFlashcardSet is one narrow findFirst and false for a missing set', async () => {
        const findFirst = jest
            .fn()
            .mockResolvedValueOnce(row())
            .mockResolvedValueOnce(null);
        const prisma = { flashCardSet: { findFirst } } as never;
        expect(await canAccessFlashcardSet(prisma, 's', 'w')).toBe(true);
        expect(await canAccessFlashcardSet(prisma, 's', 'w')).toBe(false);
        expect(findFirst).toHaveBeenCalledWith({
            where: { id: 's' },
            select: {
                userId: true,
                isPublic: true,
                whitelist: true,
                codeGrantedIds: true,
            },
        });
    });

    it("never reads the owner's account (no join, no role): decision uses the set's own fields", () => {
        const src = readFileSync(
            join(__dirname, 'flashcardset-access.ts'),
            'utf8'
        );
        expect(src).not.toMatch(/role|isSystemAdmin|user:\s*\{|\binclude:/i);
    });
});
