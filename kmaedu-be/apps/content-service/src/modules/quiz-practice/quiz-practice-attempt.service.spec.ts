import { ConflictException, NotFoundException } from '@nestjs/common';
import { QuizPracticeAttemptService } from './quiz-practice-attempt.service';
import { keysOf } from '../common/keys-deep.test-util';

const user = { id: 'me' } as never;
const row = (over: Record<string, unknown> = {}) => ({
    id: 'a1', quizSetId: 's1', type: 0, answers: { q1: 'A', ghost: 'Z' }, currentIndex: 0,
    markedQuestions: [], timeSpentSeconds: 5, timeLimitMinutes: null, isSubmitted: false,
    score: null, totalQuestions: 2, correctAnswers: 0, startedAt: new Date(0), submittedAt: null,
    updatedAt: new Date(0), ...over,
});
const questions = [
    { id: 'q1', question: 'Q1', options: ['x', 'y'], answer: 'A' },
    { id: 'q2', question: 'Q2', options: ['x', 'y'], answer: 'B' },
];
const grantedSet = { userId: 'owner', isPublic: false, whitelist: ['me'], codeGrantedIds: [] };
const progress = { answers: { q1: 'A' }, currentIndex: 1, markedQuestions: ['q1'], timeSpentSeconds: 9 };

function build(owned: unknown = row()) {
    const tx = {
        quizSet: { findFirst: jest.fn().mockResolvedValue(grantedSet) },
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'a1' }]),
        quizPracticeAttempt: { update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => row({ ...data })) },
    };
    const prisma = {
        quizSet: tx.quizSet,
        quizPracticeAttempt: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
        },
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const repo = {
        findOwned: jest.fn().mockResolvedValue(owned),
        findQuestions: jest.fn().mockResolvedValue(questions),
    };
    return { service: new QuizPracticeAttemptService(prisma as never, repo as never), prisma, tx, repo };
}

describe('QuizPracticeAttemptService', () => {
    describe('saveAttempt (autosave guard)', () => {
        it('writes only my own OPEN attempt: the owner and isSubmitted:false are in the where', async () => {
            const { service, prisma } = build();
            await expect(service.saveAttempt(user, 'a1', progress)).resolves.toEqual({ saved: true });
            expect(prisma.quizPracticeAttempt.updateMany).toHaveBeenCalledWith({
                where: { id: 'a1', userId: 'me', isSubmitted: false },
                data: { ...progress, updatedBy: 'me' },
            });
        });

        it('not mine / missing -> 404 and nothing is written', async () => {
            const { service, prisma, repo } = build(null);
            await expect(service.saveAttempt(user, 'a1', progress)).rejects.toBeInstanceOf(NotFoundException);
            expect(repo.findOwned).toHaveBeenCalledWith('a1', 'me');
            expect(prisma.quizPracticeAttempt.updateMany).not.toHaveBeenCalled();
        });

        it('mine but already submitted -> 409 ALREADY_SUBMITTED', async () => {
            const { service, prisma } = build(row({ isSubmitted: true }));
            const err = await service.saveAttempt(user, 'a1', progress).catch((e) => e);
            expect(err).toBeInstanceOf(ConflictException);
            expect(err.getResponse()).toMatchObject({ code: 'ALREADY_SUBMITTED' });
            expect(prisma.quizPracticeAttempt.updateMany).not.toHaveBeenCalled();
        });

        it('submitted between the read and the write -> still 409', async () => {
            const { service, prisma, repo } = build();
            prisma.quizPracticeAttempt.updateMany.mockResolvedValue({ count: 0 });
            repo.findOwned.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ isSubmitted: true }));
            const err = await service.saveAttempt(user, 'a1', progress).catch((e) => e);
            expect(err.getResponse()).toMatchObject({ code: 'ALREADY_SUBMITTED' });
        });

        it('access lost (whitelist removed / code rotated / made private) -> 404 and nothing is written', async () => {
            const { service, prisma, tx } = build();
            tx.quizSet.findFirst.mockResolvedValue({ ...grantedSet, whitelist: [] });
            await expect(service.saveAttempt(user, 'a1', progress)).rejects.toBeInstanceOf(NotFoundException);
            expect(prisma.quizPracticeAttempt.updateMany).not.toHaveBeenCalled();
            tx.quizSet.findFirst.mockResolvedValue(null);
            await expect(service.saveAttempt(user, 'a1', progress)).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('submitAttempt', () => {
        it('scores from the stored answers (unknown question ids ignored), under a row lock', async () => {
            const { service, tx } = build();
            const res = await service.submitAttempt(user, 'a1');
            expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
            expect(tx.quizPracticeAttempt.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ isSubmitted: true, score: 5, correctAnswers: 1, totalQuestions: 2 }),
                })
            );
            expect(res.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
            expect(res.questions[0]).toMatchObject({ correctAnswer: 'A', isCorrect: true });
            expect(res.questions[1]).toMatchObject({ selectedAnswer: null, isCorrect: false });
        });

        it('freezes the per-question result (text, options, pick, key, verdict) on the row', async () => {
            const { service, tx } = build();
            const res = await service.submitAttempt(user, 'a1');
            const data = tx.quizPracticeAttempt.update.mock.calls[0][0].data as { resultSnapshot: Array<Record<string, unknown>> };
            expect(data.resultSnapshot).toEqual(res.questions);
            expect(data.resultSnapshot[0]).toMatchObject({ question: 'Q1', options: ['x', 'y'], correctAnswer: 'A', isCorrect: true });
        });

        it('access lost -> 404, no score, no key, nothing written', async () => {
            const { service, tx } = build();
            tx.quizSet.findFirst.mockResolvedValue({ ...grantedSet, whitelist: [] });
            await expect(service.submitAttempt(user, 'a1')).rejects.toBeInstanceOf(NotFoundException);
            expect(tx.quizPracticeAttempt.update).not.toHaveBeenCalled();
        });

        it('already submitted -> 409 ALREADY_SUBMITTED and nothing is written', async () => {
            const { service, tx } = build(row({ isSubmitted: true }));
            const err = await service.submitAttempt(user, 'a1').catch((e) => e);
            expect(err.getResponse()).toMatchObject({ code: 'ALREADY_SUBMITTED' });
            expect(tx.quizPracticeAttempt.update).not.toHaveBeenCalled();
        });

        it('someone else attempt (lock finds no row) -> 404', async () => {
            const { service, tx } = build();
            tx.$queryRaw.mockResolvedValue([]);
            await expect(service.submitAttempt(user, 'a1')).rejects.toBeInstanceOf(NotFoundException);
        });

        it('row locked but the owned read is empty -> 404', async () => {
            const { service } = build(null);
            await expect(service.submitAttempt(user, 'a1')).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('getAttempt', () => {
        it('not mine -> 404', async () => {
            await expect(build(null).service.getAttempt(user, 'a1')).rejects.toBeInstanceOf(NotFoundException);
        });

        it('open: no answer keys anywhere in the payload', async () => {
            const res = await build().service.getAttempt(user, 'a1');
            const keys = keysOf(res);
            for (const banned of ['answer', 'correctAnswer', 'correctAnswers', 'isCorrect', 'score'])
                expect(keys).not.toContain(banned);
        });

        it('open attempt but access lost -> 404 and the question list is never loaded', async () => {
            const { service, tx, repo } = build();
            tx.quizSet.findFirst.mockResolvedValue({ ...grantedSet, isPublic: false, whitelist: [], codeGrantedIds: [] });
            await expect(service.getAttempt(user, 'a1')).rejects.toBeInstanceOf(NotFoundException);
            expect(repo.findQuestions).not.toHaveBeenCalled();
        });

        it('submitted: served from the stored snapshot, even if the set changed or access was lost', async () => {
            const snapshot = [{ id: 'q1', question: 'OLD', options: ['x'], selectedAnswer: 'A', correctAnswer: 'A', isCorrect: true }];
            const { service, tx, repo } = build(row({ isSubmitted: true, score: 5, correctAnswers: 1, resultSnapshot: snapshot }));
            tx.quizSet.findFirst.mockResolvedValue(null);
            const res = await service.getAttempt(user, 'a1');
            expect(res.attempt).toMatchObject({ score: 5, correctAnswers: 1 });
            expect(res.questions).toEqual(snapshot);
            expect(repo.findQuestions).not.toHaveBeenCalled();
        });

        it('submitted before snapshots existed: falls back to re-scoring the current questions', async () => {
            const res = await build(row({ isSubmitted: true, score: 5, correctAnswers: 1, resultSnapshot: null })).service.getAttempt(user, 'a1');
            expect(res.questions[0]).toHaveProperty('correctAnswer', 'A');
        });
    });

    describe('listAttempts', () => {
        it('always the caller, submitted only, newest first; a quizSetId only narrows', async () => {
            const { service, prisma } = build();
            prisma.quizPracticeAttempt.count.mockResolvedValue(21);
            const res = await service.listAttempts(user, { quizSetId: 's1', page: 3, limit: 10 });
            const args = prisma.quizPracticeAttempt.findMany.mock.calls[0][0];
            expect(args.where).toEqual({ userId: 'me', isSubmitted: true, quizSetId: 's1' });
            expect(args).toMatchObject({ orderBy: { submittedAt: 'desc' }, skip: 20, take: 10 });
            expect(res).toMatchObject({ total: 21, totalPages: 3 });
            await service.listAttempts(user, { page: 1, limit: 10 });
            expect(prisma.quizPracticeAttempt.findMany.mock.calls[1][0].where).toEqual({ userId: 'me', isSubmitted: true });
        });
    });
});
