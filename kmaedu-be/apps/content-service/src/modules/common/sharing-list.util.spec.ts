import { ConflictException, NotFoundException } from '@nestjs/common';
import {
    SHARE_LIST_CAP,
    SharingDeltaSchema,
    appendCodeGranted,
    applySharingUpdate,
} from './sharing-list.util';

/** A prisma whose `$transaction` runs the callback against a tx with a scripted `$queryRaw`. */
function fakePrisma(rows: unknown[], executeRaw = 1) {
    const tx = {
        $queryRaw: jest.fn(async () => rows),
        $executeRaw: jest.fn(async () => executeRaw),
        quizSet: { findFirst: jest.fn() },
    };
    const prisma = {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
        $executeRaw: tx.$executeRaw,
        quizSet: tx.quizSet,
    };
    return { prisma: prisma as never, tx };
}

const baseInput = {
    id: 's1',
    ownerId: 'o',
    add: [] as string[],
    remove: [] as string[],
    removeCodeGranted: [] as string[],
    codeMode: 'keep' as const,
    newCode: '123456',
};

describe('SharingDeltaSchema', () => {
    it('needs at least one field', () => {
        expect(SharingDeltaSchema.safeParse({}).success).toBe(false);
        expect(SharingDeltaSchema.safeParse({ isPublic: false }).success).toBe(true);
        expect(SharingDeltaSchema.safeParse({ codeEnabled: false }).success).toBe(true);
        expect(SharingDeltaSchema.safeParse({ removeCodeGrantedIds: ['u'] }).success).toBe(true);
    });

    it('rejects the old full-replace body instead of half-applying it', () => {
        expect(
            SharingDeltaSchema.safeParse({ isPublic: true, accessCode: '123456', whitelist: [] })
                .success
        ).toBe(false);
    });

    it('rejects an array above the cap and wrong types', () => {
        const ids = Array.from({ length: SHARE_LIST_CAP + 1 }, (_, i) => `u${i}`);
        expect(SharingDeltaSchema.safeParse({ addUserIds: ids }).success).toBe(false);
        expect(SharingDeltaSchema.safeParse({ removeUserIds: ids }).success).toBe(false);
        expect(SharingDeltaSchema.safeParse({ addUserIds: ids.slice(1) }).success).toBe(true);
        expect(SharingDeltaSchema.safeParse({ addUserIds: [1] }).success).toBe(false);
        expect(SharingDeltaSchema.safeParse({ isPublic: 'yes' }).success).toBe(false);
    });
});

describe('applySharingUpdate', () => {
    const row = (n: number) => ({
        isPublic: false,
        accessCode: null,
        whitelist: ['a'],
        codeGrantedIds: [],
        n,
    });

    it('returns the updated row without the counter', async () => {
        const { prisma } = fakePrisma([row(1)]);
        const out = await applySharingUpdate(prisma, 'QuizSet', baseInput);
        expect(out).toEqual({
            isPublic: false,
            accessCode: null,
            whitelist: ['a'],
            codeGrantedIds: [],
        });
    });

    it('404 when no row matched (not the owner or missing)', async () => {
        const { prisma } = fakePrisma([]);
        await expect(
            applySharingUpdate(prisma, 'QuizSet', baseInput)
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409 SHARE_LIST_FULL above the cap, thrown inside the transaction (rolls back)', async () => {
        const { prisma } = fakePrisma([row(SHARE_LIST_CAP + 1)]);
        const err = await applySharingUpdate(prisma, 'QuizSet', baseInput).catch((e) => e);
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).getResponse()).toMatchObject({
            code: 'SHARE_LIST_FULL',
        });
        expect(SHARE_LIST_CAP).toBe(2000);
        const ok = fakePrisma([row(SHARE_LIST_CAP)]);
        await expect(applySharingUpdate(ok.prisma, 'QuizSet', baseInput)).resolves.toBeDefined();
    });

    it('refuses a table outside the fixed enum before touching the database', async () => {
        const { prisma, tx } = fakePrisma([row(1)]);
        await expect(
            applySharingUpdate(prisma, 'User; DROP TABLE x' as never, baseInput)
        ).rejects.toThrow(/table/i);
        expect(tx.$queryRaw).not.toHaveBeenCalled();
    });
});

describe('appendCodeGranted', () => {
    it('1 row updated: nothing else to do', async () => {
        const { prisma } = fakePrisma([], 1);
        await expect(appendCodeGranted(prisma, 'QuizSet', 's', 'u')).resolves.toBeUndefined();
    });

    it('0 rows and the user is already present: ok', async () => {
        const { prisma, tx } = fakePrisma([], 0);
        tx.quizSet.findFirst.mockResolvedValue({ codeGrantedIds: ['u'] });
        await expect(appendCodeGranted(prisma, 'QuizSet', 's', 'u')).resolves.toBeUndefined();
    });

    it('0 rows and the list is full: 409 SHARE_LIST_FULL', async () => {
        const { prisma, tx } = fakePrisma([], 0);
        tx.quizSet.findFirst.mockResolvedValue({
            codeGrantedIds: Array.from({ length: SHARE_LIST_CAP }, (_, i) => `x${i}`),
        });
        await expect(appendCodeGranted(prisma, 'QuizSet', 's', 'u')).rejects.toBeInstanceOf(
            ConflictException
        );
    });

    it('0 rows and no such resource: 404', async () => {
        const { prisma, tx } = fakePrisma([], 0);
        tx.quizSet.findFirst.mockResolvedValue(null);
        await expect(appendCodeGranted(prisma, 'QuizSet', 's', 'u')).rejects.toBeInstanceOf(
            NotFoundException
        );
    });
});
