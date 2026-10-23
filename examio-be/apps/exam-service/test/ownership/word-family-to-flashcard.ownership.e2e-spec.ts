import {
    bootExamApp,
    rid,
    type ExamTestApp,
    type TestUser,
} from './support/exam-test-app';
import { call } from './support/http';

/**
 * POST /word-family/:id/to-flashcard against real Postgres and a fake vocabulary
 * gRPC server (real wire contract). RT-15: cards are linked by the ids assigned
 * at insert, never by `question`.
 */
describe('word-family to-flashcard (e2e)', () => {
    let t: ExamTestApp;
    let teacher: TestUser;
    let otherTeacher: TestUser;
    let student: TestUser;
    const tok: Record<string, string> = {};
    const familyId = `wf_${rid()}`;
    const words = [
        { word: 'order', pos: 'v', meaningVi: 'đặt hàng', example: 'I order tea' },
        { word: 'orderly', pos: 'adj', meaningVi: 'ngăn nắp', example: 'An orderly desk' },
    ];

    beforeAll(async () => {
        t = await bootExamApp();
        teacher = await t.createUser(['TEACHER']);
        otherTeacher = await t.createUser(['TEACHER']);
        student = await t.createUser(['STUDENT']);
        tok.teacher = await t.tokenFor(teacher);
        tok.other = await t.tokenFor(otherTeacher);
        tok.student = await t.tokenFor(student);
        t.vocabulary.add({
            id: familyId,
            rootWord: 'order',
            categorySlug: 'shopping-restaurant',
            categoryName: 'Mua sắm',
            words,
        });
    });
    afterAll(() => t.close());

    it('a TEACHER gets a private set with exactly the new cards linked', async () => {
        const res = await call(t.server, 'post', `/word-family/${familyId}/to-flashcard`, tok.teacher, {});
        expect(res.status).toBe(201);
        expect(res.body.cardCount).toBe(2);

        const set = await t.prisma.flashCardSet.findUniqueOrThrow({
            where: { id: res.body.flashCardSetId },
            include: { detailsFlashCard: { include: { flashCard: true } } },
        });
        expect(set.userId).toBe(teacher.id);
        expect(set.isPublic).toBe(false);
        expect(set.title).toBe('Gia đình từ: order');
        expect(set.detailsFlashCard).toHaveLength(2);
        expect(set.detailsFlashCard.map((d) => d.flashCard.question).sort()).toEqual([
            '<strong>order</strong> <em>(v)</em>',
            '<strong>orderly</strong> <em>(adj)</em>',
        ]);
    });

    it('RT-15: another user\'s card with an identical question is NOT linked into the new set', async () => {
        const question = '<strong>order</strong> <em>(v)</em>';
        const foreign = await t.prisma.flashCard.create({
            data: { id: `fc_${rid()}`, question, answer: 'foreign answer' },
        });
        const foreignSet = await t.prisma.flashCardSet.create({
            data: { id: `fs_${rid()}`, title: 'other', userId: otherTeacher.id },
        });
        await t.prisma.detailsFlashCard.create({
            data: { flashCardSetId: foreignSet.id, flashCardId: foreign.id },
        });

        const res = await call(t.server, 'post', `/word-family/${familyId}/to-flashcard`, tok.teacher, {
            selectedIndices: [0],
        });
        expect(res.status).toBe(201);
        expect(res.body.cardCount).toBe(1);

        const linked = await t.prisma.detailsFlashCard.findMany({
            where: { flashCardSetId: res.body.flashCardSetId },
        });
        expect(linked).toHaveLength(1);
        expect(linked[0].flashCardId).not.toBe(foreign.id);
        // the foreign card stays only in its own set
        const foreignLinks = await t.prisma.detailsFlashCard.findMany({
            where: { flashCardId: foreign.id },
        });
        expect(foreignLinks.map((l) => l.flashCardSetId)).toEqual([foreignSet.id]);
    });

    it('an unknown word family (vocabulary NOT_FOUND) is 404 and writes no set', async () => {
        const before = await t.prisma.flashCardSet.count({ where: { userId: teacher.id } });
        const res = await call(t.server, 'post', '/word-family/missing/to-flashcard', tok.teacher, {});
        expect(res.status).toBe(404);
        expect(await t.prisma.flashCardSet.count({ where: { userId: teacher.id } })).toBe(before);
    });

    it('selectedIndices that match no word is 400', async () => {
        const res = await call(t.server, 'post', `/word-family/${familyId}/to-flashcard`, tok.teacher, {
            selectedIndices: [99],
        });
        expect(res.status).toBe(400);
    });

    it('a STUDENT lacks flashcardset:manage: 403 and vocabulary is never asked', async () => {
        t.vocabulary.requested.length = 0;
        const res = await call(t.server, 'post', `/word-family/${familyId}/to-flashcard`, tok.student, {});
        expect(res.status).toBe(403);
        expect(t.vocabulary.requested).toEqual([]);
    });

    it('anonymous is 401', async () => {
        const res = await call(t.server, 'post', `/word-family/${familyId}/to-flashcard`);
        expect(res.status).toBe(401);
    });
});
