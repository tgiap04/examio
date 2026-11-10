import { computeContentHash } from './content-hash';
import { QuizSetSnapshotService } from './quiz-set-snapshot.service';

const row = {
    id: 's1',
    title: 'Quiz',
    userId: 'owner',
    labels: [{ id: 'l1', name: 'A', order: 0, color: null }],
    detailsQuizQuestions: [
        { labelId: 'l1', quizQuestion: { id: 'q1', question: 'Q1', options: ['x', 'y'], answer: 'A' } },
        { labelId: null, quizQuestion: { id: 'q2', question: 'Q2', options: ['x', 'y'], answer: 'B' } },
    ],
};

function setup(rows: unknown[] = [row]) {
    const prisma = {
        quizSet: {
            findMany: jest.fn().mockResolvedValue(rows),
            count: jest.fn().mockResolvedValue(3),
        },
        flashCardSet: { count: jest.fn().mockResolvedValue(2) },
    };
    return { prisma, service: new QuizSetSnapshotService(prisma as never) };
}

describe('QuizSetSnapshotService', () => {
    it('GetQuizSetSnapshot and GetQuizSetsByIds(with_content_hash) share ONE hash function and agree', async () => {
        const { service } = setup();
        const snap = await service.snapshot('owner', 's1');
        const [summary] = await service.summaries('owner', ['s1'], true);
        expect(snap?.contentHash).toBe(summary.contentHash);
        expect(snap?.contentHash).toBe(computeContentHash(snap!.labels, snap!.questions));
        expect(snap?.questions.map((q) => [q.id, q.order, q.labelId])).toEqual([
            ['q1', 0, 'l1'],
            ['q2', 1, null],
        ]);
    });

    it('scopes every read by owner in the where clause itself (a foreign set is absent, not forbidden)', async () => {
        const { prisma, service } = setup([]);
        expect(await service.snapshot('intruder', 's1')).toBeNull();
        expect(prisma.quizSet.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: { in: ['s1'] }, userId: 'intruder' } })
        );
    });

    it('summaries without the hash never read questions; blank and duplicate ids are dropped', async () => {
        const { prisma, service } = setup([{ id: 's1', title: 'Quiz', _count: { detailsQuizQuestions: 7 } }]);
        const out = await service.summaries('owner', ['s1', 's1', ' '], false);
        expect(out).toEqual([{ id: 's1', title: 'Quiz', questionCount: 7 }]);
        const args = prisma.quizSet.findMany.mock.calls[0][0];
        expect(args.where.id.in).toEqual(['s1']);
        expect(args.select).not.toHaveProperty('detailsQuizQuestions');
        expect(await service.summaries('owner', [], true)).toEqual([]);
    });

    it('reports the question count with and without the hash, from the same source of truth', async () => {
        const counted = setup([{ id: 's1', title: 'Quiz', _count: { detailsQuizQuestions: 2 } }]);
        const [plain] = await counted.service.summaries('owner', ['s1'], false);
        expect(plain.questionCount).toBe(2);
        expect(counted.prisma.quizSet.findMany.mock.calls[0][0].select._count).toEqual({
            select: { detailsQuizQuestions: true },
        });
        const [hashed] = await setup().service.summaries('owner', ['s1'], true);
        expect(hashed.questionCount).toBe(2);
    });

    it('stats counts only the owner\'s own sets', async () => {
        const { prisma, service } = setup();
        expect(await service.stats('owner')).toEqual({ quizSetCount: 3, flashcardSetCount: 2 });
        expect(prisma.quizSet.count).toHaveBeenCalledWith({ where: { userId: 'owner' } });
        expect(prisma.flashCardSet.count).toHaveBeenCalledWith({ where: { userId: 'owner' } });
    });
});
