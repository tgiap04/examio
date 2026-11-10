import { GenerationJobRepository } from '../../src/modules/ai/generation-job.repository';
import { DocumentStatus } from '../ownership/support/fake-document';
import { bootContentApp, call, flashcardItems, quizItems, rid, teacher, type ContentTestApp } from './support';

/**
 * `GET /ai/recent-uploads` moved the documents to document-service but kept its response: the same array
 * of upload rows plus `quizHistory` / `flashcardHistory` summaries the FE reads.
 */
describe('recent-uploads (e2e)', () => {
    let t: ContentTestApp;

    beforeAll(async () => {
        t = await bootContentApp();
    });
    afterAll(() => t?.close());

    const history = (userId: string, storageId: string, kind: 'quiz' | 'flashcard', n: number, at: Date) =>
        kind === 'quiz'
            ? t.prisma.historyGeneratedQuizz.create({ data: { id: `q_${rid()}`, userId, userStorageId: storageId, quizzes: quizItems(n), createdAt: at } })
            : t.prisma.historyGeneratedFlashcard.create({ data: { id: `f_${rid()}`, userId, userStorageId: storageId, flashcards: flashcardItems(n), createdAt: at } });

    it('returns the old shape with the newest quiz / flashcard summary per document: 1 ListDocuments + 1 history query for N documents', async () => {
        const user = await teacher(t);
        const stranger = await teacher(t);
        const docs = Array.from({ length: 5 }, (_, i) =>
            t.document.add(user.id, { filename: `d${i}.pdf`, size: String(100 + i), createdAt: String(Date.now() + i) })
        );
        const [a, b, c] = [docs[4], docs[3], docs[2]]; // the newest are listed first
        await history(user.id, a.id, 'quiz', 2, new Date(Date.now() - 5000));
        const newestQuiz = await history(user.id, a.id, 'quiz', 4, new Date(Date.now() - 1000));
        const flash = await history(user.id, a.id, 'flashcard', 3, new Date());
        await history(user.id, b.id, 'flashcard', 6, new Date());
        await history(stranger.id, c.id, 'quiz', 9, new Date()); // another user's history is never shown

        const listBefore = t.document.count('ListDocuments');
        // The summaries come from ONE raw statement (UNION of the two newest-per-document selects):
        // the repository method runs once for the whole page and no per-document read happens.
        const summaries = jest.spyOn(t.app.get(GenerationJobRepository), 'historySummaries');
        const findMany = jest.spyOn(t.prisma.historyGeneratedQuizz, 'findMany');
        const res = await call(t.server, 'get', '/ai/recent-uploads?page=1&size=10', user.token);
        const raw = summaries.mock.calls;
        const many = findMany.mock.calls.length;
        summaries.mockRestore();
        findMany.mockRestore();

        expect(res.status).toBe(200);
        expect(t.document.count('ListDocuments') - listBefore).toBe(1);
        expect(raw).toEqual([[user.id, docs.map((d) => d.id).reverse()]]);
        expect(many).toBe(0);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.map((d: { id: string }) => d.id)).toEqual(docs.map((d) => d.id).reverse());

        const first = res.body[0];
        expect(Object.keys(first).sort()).toEqual(
            [
                'createdAt', 'creditCharged', 'filename', 'flashcardHistory', 'id', 'keyR2', 'mimetype',
                'pageCount', 'processingStatus', 'quizHistory', 'size', 'updatedAt', 'url', 'userId',
            ].sort()
        );
        expect(first).toMatchObject({
            id: a.id,
            userId: user.id,
            filename: 'd4.pdf',
            size: 104,
            processingStatus: 'COMPLETED',
            quizHistory: { id: newestQuiz.id, quizCount: 4 },
            flashcardHistory: { id: flash.id, flashcardCount: 3 },
        });
        expect(typeof first.quizHistory.createdAt).toBe('string');
        expect(res.body[1]).toMatchObject({ id: b.id, quizHistory: null, flashcardHistory: { flashcardCount: 6 } });
        expect(res.body[2]).toMatchObject({ id: c.id, quizHistory: null, flashcardHistory: null });
    });

    it('an empty list is []; page and size select the page; STUDENT is 403, anonymous 401', async () => {
        const user = await teacher(t);
        expect((await call(t.server, 'get', '/ai/recent-uploads', user.token)).body).toEqual([]);

        for (let i = 0; i < 3; i++) t.document.add(user.id, { createdAt: String(Date.now() + i), processingStatus: DocumentStatus.DOCUMENT_PROCESSING_STATUS_PENDING });
        expect((await call(t.server, 'get', '/ai/recent-uploads?page=2&size=2', user.token)).body).toHaveLength(1);

        const student = await t.createUser(['STUDENT']);
        expect((await call(t.server, 'get', '/ai/recent-uploads', await t.tokenFor(student))).status).toBe(403);
        expect((await call(t.server, 'get', '/ai/recent-uploads')).status).toBe(401);
    });

    it('document-service being down is a 503, not a 500 or an empty list', async () => {
        const user = await teacher(t);
        // the read is retried on UNAVAILABLE (idempotent), so the outage outlasts every attempt
        for (let i = 0; i < 3; i++) t.document.fault('ListDocuments', 14, 'down');
        const res = await call(t.server, 'get', '/ai/recent-uploads', user.token);
        expect(res.status).toBe(503);
    });
});
