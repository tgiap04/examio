import { NotFoundException } from '@nestjs/common';
import { OWNER_OR_PERMISSION_KEY, hasPermission } from '@examio/auth-jwt';
import { QuizSetOwnerResolver } from '../quizset/quizset-owner.resolver';
import { verifyAccessCodeOrThrow } from '../common/access-code-guard';
import { appendCodeGranted } from '../common/sharing-list.util';
import { QuizPracticeController } from './quiz-practice.controller';
import { QuizPracticeService } from './quiz-practice.service';
import { keysOf } from '../common/keys-deep.test-util';

jest.mock('../common/access-code-guard', () => ({
    ...jest.requireActual('../common/access-code-guard'),
    verifyAccessCodeOrThrow: jest.fn(),
}));
jest.mock('../common/sharing-list.util', () => ({
    ...jest.requireActual('../common/sharing-list.util'),
    appendCodeGranted: jest.fn(),
}));

const user = { id: 'me' } as never;
const set = (over: Record<string, unknown> = {}) => ({
    userId: 'owner',
    isPublic: false,
    whitelist: ['me'],
    codeGrantedIds: [],
    accessCode: null,
    title: 'T',
    _count: { detailsQuizQuestions: 2 },
    ...over,
});
const attemptRow = {
    id: 'a1',
    quizSetId: 's1',
    type: 0,
    answers: {},
    currentIndex: 0,
    markedQuestions: [],
    timeSpentSeconds: 0,
    timeLimitMinutes: null,
    isSubmitted: false,
    score: null,
    totalQuestions: 2,
    correctAnswers: 0,
    startedAt: new Date(0),
    submittedAt: null,
    updatedAt: new Date(0),
};
const questions = [
    { id: 'q1', question: 'Q1', options: ['a', 'b'], answer: 'a' },
    { id: 'q2', question: 'Q2', options: ['a', 'b'], answer: 'b' },
];

function build(found: unknown = set()) {
    const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        quizPracticeAttempt: { create: jest.fn().mockResolvedValue(attemptRow) },
    };
    const prisma = {
        quizSet: {
            findFirst: jest.fn().mockResolvedValue(found),
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
        },
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const redis = { getClient: jest.fn().mockReturnValue({ tag: 'redis' }) };
    const repo = {
        findOpen: jest.fn().mockResolvedValue(null),
        findQuestions: jest.fn().mockResolvedValue(questions),
    };
    const service = new QuizPracticeService(prisma as never, redis as never, repo as never);
    return { service, prisma, tx, redis, repo };
}

describe('QuizPracticeService', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('startAttempt', () => {
        it('no grant -> 404 and nothing is created', async () => {
            const { service, tx } = build(set({ whitelist: [] }));
            await expect(service.startAttempt(user, 's1')).rejects.toBeInstanceOf(NotFoundException);
            expect(tx.quizPracticeAttempt.create).not.toHaveBeenCalled();
        });

        it('a missing set -> 404', async () => {
            const { service } = build(null);
            await expect(service.startAttempt(user, 's1')).rejects.toBeInstanceOf(NotFoundException);
        });

        it('opens an attempt under a per user+set advisory lock, questions without the key', async () => {
            const { service, tx } = build();
            const res = await service.startAttempt(user, 's1');
            expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
            expect(tx.quizPracticeAttempt.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: { quizSetId: 's1', userId: 'me', totalQuestions: 2, createdBy: 'me' },
                })
            );
            const keys = keysOf(res);
            for (const banned of ['answer', 'correctAnswer', 'isCorrect', 'score', 'userId'])
                expect(keys).not.toContain(banned);
            expect(res.questions).toHaveLength(2);
        });

        it('resumes: an open attempt is returned as is and none is created', async () => {
            const { service, tx, repo } = build();
            repo.findOpen.mockResolvedValue({ ...attemptRow, id: 'open', currentIndex: 1 });
            const res = await service.startAttempt(user, 's1');
            expect(res.attempt.id).toBe('open');
            expect(tx.quizPracticeAttempt.create).not.toHaveBeenCalled();
        });

        it('the owner may start without a grant list entry', async () => {
            const { service } = build(set({ userId: 'me', whitelist: [] }));
            await expect(service.startAttempt(user, 's1')).resolves.toBeDefined();
        });
    });

    describe('who may start (declared on the controller)', () => {
        const meta = Reflect.getMetadata(
            OWNER_OR_PERMISSION_KEY,
            QuizPracticeController.prototype.startAttempt
        );
        it('owner OR quiz:practice, resolved through the quiz set owner', () => {
            expect(meta).toEqual({ permission: 'quiz:practice', resolver: QuizSetOwnerResolver });
        });
        it('a TEACHER lacks quiz:practice (refused unless owner); a STUDENT has it', () => {
            expect(hasPermission(['TEACHER'], 'quiz:practice')).toBe(false);
            expect(hasPermission(['STUDENT'], 'quiz:practice')).toBe(true);
        });
    });

    describe('unlock', () => {
        it('delegates the check to the lockout guard (redis client, set code, given code), then remembers the user', async () => {
            const { service, redis } = build(set({ whitelist: [], accessCode: '482913' }));
            await expect(service.unlock('s1', user, '482913')).resolves.toEqual({ canAccess: true });
            expect(verifyAccessCodeOrThrow).toHaveBeenCalledWith(redis.getClient(), {
                resourceId: 's1',
                userId: 'me',
                stored: '482913',
                given: '482913',
            });
            expect(appendCodeGranted).toHaveBeenCalledWith(expect.anything(), 'QuizSet', 's1', 'me', '482913');
        });

        it.each([
            ['whitelisted', { whitelist: ['me'] }],
            ['public', { isPublic: true, whitelist: [] }],
            ['owner', { userId: 'me', whitelist: [] }],
        ])('%s: the code is still checked but NO code grant is minted', async (_n, over) => {
            const { service } = build(set({ accessCode: '482913', ...over }));
            await expect(service.unlock('s1', user, '482913')).resolves.toEqual({ canAccess: true });
            expect(verifyAccessCodeOrThrow).toHaveBeenCalled();
            expect(appendCodeGranted).not.toHaveBeenCalled();
        });

        it('a lockout / wrong code from the guard stops everything: nothing is remembered', async () => {
            const { service } = build(set({ accessCode: '482913' }));
            (verifyAccessCodeOrThrow as jest.Mock).mockRejectedValueOnce(new Error('CODE_LOCKED'));
            await expect(service.unlock('s1', user, '000000')).rejects.toThrow('CODE_LOCKED');
            expect(appendCodeGranted).not.toHaveBeenCalled();
        });

        it('a missing set is a 404 before any code check', async () => {
            const { service } = build(null);
            await expect(service.unlock('s1', user, '482913')).rejects.toBeInstanceOf(NotFoundException);
            expect(verifyAccessCodeOrThrow).not.toHaveBeenCalled();
        });
    });

    describe('getAccess', () => {
        it.each([
            [set({ userId: 'me' }), 'me', 'owner'],
            [set({ isPublic: true }), undefined, 'public'],
            [set(), 'me', 'whitelist'],
            [set({ whitelist: [], codeGrantedIds: ['me'] }), 'me', 'code'],
        ])('grant reason %#', async (row, uid, reason) => {
            const { service } = build(row);
            await expect(service.getAccess('s1', uid)).resolves.toMatchObject({ canAccess: true, requiresCode: false, reason });
        });

        it('a code-protected set without a grant asks for the code and never returns it', async () => {
            const { service } = build(set({ whitelist: [], accessCode: '482913' }));
            const res = await service.getAccess('s1', 'me');
            expect(res).toEqual({ title: 'T', questionCount: 2, canAccess: false, requiresCode: true, reason: null });
            expect(JSON.stringify(res)).not.toContain('482913');
        });

        it('an anonymous caller learns only that a code is needed (no title, no question count)', async () => {
            const { service } = build(set({ whitelist: [], accessCode: '482913' }));
            await expect(service.getAccess('s1', undefined)).resolves.toEqual({ canAccess: false, requiresCode: true, reason: null });
        });

        it('private with no code and no grant, or missing: 404', async () => {
            await expect(build(set({ whitelist: [] })).service.getAccess('s1', 'me')).rejects.toBeInstanceOf(NotFoundException);
            await expect(build(null).service.getAccess('s1', 'me')).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('listSets', () => {
        it('one query for the page + one count, scoped to my grants, mapped without ids of others', async () => {
            const { service, prisma } = build();
            prisma.quizSet.findMany.mockResolvedValue([
                {
                    id: 's1', title: 'T', description: null, thumbnail: null,
                    user: { name: 'Teach' }, _count: { detailsQuizQuestions: 3 },
                    practiceAttempts: [{ id: 'a', isSubmitted: false, score: 9, updatedAt: new Date(0) }],
                },
                {
                    id: 's2', title: 'U', description: 'd', thumbnail: null,
                    user: { name: null }, _count: { detailsQuizQuestions: 0 }, practiceAttempts: [],
                },
            ]);
            prisma.quizSet.count.mockResolvedValue(13);
            const res = await service.listSets(user, { page: 2, limit: 6 });
            const args = prisma.quizSet.findMany.mock.calls[0][0];
            expect(args.where.OR).toEqual([
                { whitelist: { has: 'me' } },
                { codeGrantedIds: { has: 'me' } },
                { isPublic: true, practiceAttempts: { some: { userId: 'me' } } },
            ]);
            expect(args).toMatchObject({ skip: 6, take: 6 });
            expect(args.select.practiceAttempts.where).toEqual({ userId: 'me' });
            expect(res).toMatchObject({ total: 13, page: 2, limit: 6, totalPages: 3 });
            expect(res.sets[0]).toMatchObject({ questionCount: 3, owner: { name: 'Teach' } });
            // an unsubmitted attempt never exposes a score
            expect(res.sets[0].lastAttempt).toMatchObject({ isSubmitted: false, score: null });
            expect(res.sets[1].lastAttempt).toBeNull();
        });
    });
});
