import { readFileSync } from 'fs';
import { join } from 'path';
import { accessKindOf, canAccessQuizSet } from './quizset-access';

const row = (over: Record<string, unknown> = {}) => ({
    userId: 'owner',
    isPublic: false,
    whitelist: ['w'],
    codeGrantedIds: ['c'],
    ...over,
});

describe('quiz set access', () => {
    it.each([
        [row({ isPublic: true }), undefined, 'public'],
        [row(), 'owner', 'owner'],
        [row(), 'w', 'whitelist'],
        [row(), 'c', 'code'],
        [row(), 'stranger', null],
        [row(), undefined, null],
    ])('accessKindOf(%j, %p) = %p', (r, userId, expected) => {
        expect(accessKindOf(r as never, userId)).toBe(expected);
    });

    it('is one narrow findFirst, false for a missing set', async () => {
        const findFirst = jest
            .fn()
            .mockResolvedValueOnce(row())
            .mockResolvedValueOnce(null);
        const prisma = { quizSet: { findFirst } } as never;
        expect(await canAccessQuizSet(prisma, 's', 'c')).toBe(true);
        expect(await canAccessQuizSet(prisma, 's', 'c')).toBe(false);
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

    it("never reads the owner's account: decision uses the set's own fields", () => {
        const src = readFileSync(join(__dirname, 'quizset-access.ts'), 'utf8');
        expect(src).not.toMatch(/role|isSystemAdmin|user:\s*\{|\binclude:/i);
    });
});
