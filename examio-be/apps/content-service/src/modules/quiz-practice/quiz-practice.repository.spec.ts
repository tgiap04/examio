import { ATTEMPT_SELECT, QuizPracticeRepository } from './quiz-practice.repository';

function build() {
    const prisma = {
        detailsQuizQuestion: { findMany: jest.fn() },
        quizPracticeAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    return { repo: new QuizPracticeRepository(prisma as never), prisma };
}

describe('QuizPracticeRepository', () => {
    it('findOwned: the owner is part of the where, with the explicit select (no userId column)', async () => {
        const { repo, prisma } = build();
        await repo.findOwned('a1', 'me');
        expect(prisma.quizPracticeAttempt.findFirst).toHaveBeenCalledWith({
            where: { id: 'a1', userId: 'me' },
            select: ATTEMPT_SELECT,
        });
        expect(Object.keys(ATTEMPT_SELECT)).not.toContain('userId');
        expect(Object.keys(ATTEMPT_SELECT)).not.toContain('createdBy');
    });

    it('findOpen: latest UNSUBMITTED attempt of this user on this set', async () => {
        const { repo, prisma } = build();
        await repo.findOpen('s1', 'me');
        expect(prisma.quizPracticeAttempt.findFirst).toHaveBeenCalledWith({
            where: { quizSetId: 's1', userId: 'me', isSubmitted: false },
            orderBy: { updatedAt: 'desc' },
            select: ATTEMPT_SELECT,
        });
    });

    it('findQuestions: stable order, selects the key only for scoring, flattens the relation', async () => {
        const { repo, prisma } = build();
        const q = { id: 'q1', question: 'Q', options: ['a'], answer: 'a' };
        prisma.detailsQuizQuestion.findMany.mockResolvedValue([{ quizQuestion: q }]);
        await expect(repo.findQuestions('s1')).resolves.toEqual([q]);
        expect(prisma.detailsQuizQuestion.findMany).toHaveBeenCalledWith({
            where: { quizSetId: 's1' },
            orderBy: [{ quizQuestion: { createdAt: 'asc' } }, { quizQuestionId: 'asc' }],
            select: { quizQuestion: { select: { id: true, question: true, options: true, answer: true } } },
        });
    });

    it('an explicit client (a transaction) is used instead of the default one', async () => {
        const { repo } = build();
        const tx = { quizPracticeAttempt: { findFirst: jest.fn().mockResolvedValue('row') } };
        await expect(repo.findOwned('a1', 'me', tx as never)).resolves.toBe('row');
    });
});
