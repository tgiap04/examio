import {
    bootExamApp,
    rid,
    type ExamTestApp,
    type TestUser,
} from './support/exam-test-app';
import { call } from './support/http';
import { seedQuizSet } from './support/seed';

/**
 * Two STUDENTs (A, B) are both granted the same set: nothing of A's attempts
 * may be readable or writable by B. Titles carry the allowlist keys
 * (`Controller.handler`) that `handler-declarations.spec.ts` looks for.
 */
describe('quiz practice ownership (e2e)', () => {
    let t: ExamTestApp;
    let owner: TestUser;
    let otherTeacher: TestUser;
    let a: TestUser;
    let b: TestUser;
    let outsider: TestUser;
    const tok: Record<string, string> = {};
    let setId: string;
    let attemptA: string;

    const run = (m: 'get' | 'post' | 'put', p: string, who?: string, body?: object) =>
        call(t.server, m, p, who ? tok[who] : undefined, body ?? (m === 'get' ? undefined : {}));
    const progress = {
        answers: { x: 'tampered' },
        currentIndex: 9,
        markedQuestions: [],
        timeSpentSeconds: 999,
    };

    beforeAll(async () => {
        t = await bootExamApp();
        owner = await t.createUser(['TEACHER']);
        otherTeacher = await t.createUser(['TEACHER']);
        a = await t.createUser(['STUDENT']);
        b = await t.createUser(['STUDENT']);
        outsider = await t.createUser(['STUDENT']);
        for (const [k, u] of Object.entries({ owner, otherTeacher, a, b, outsider }))
            tok[k] = await t.tokenFor(u);
        setId = (await seedQuizSet(t, owner.id, { whitelist: [a.id, b.id] })).id;
        attemptA = (await run('post', '/quiz-practice/attempts', 'a', { quizSetId: setId })).body
            .attempt.id;
    });
    afterAll(() => t.close());

    it('QuizPracticeController.getAttempt: B reads A attempt -> 404, A reads own -> 200', async () => {
        expect((await run('get', `/quiz-practice/attempts/${attemptA}`, 'b')).status).toBe(404);
        expect((await run('get', `/quiz-practice/attempts/${attemptA}`, 'outsider')).status).toBe(404);
        expect((await run('get', `/quiz-practice/attempts/${attemptA}`, 'a')).status).toBe(200);
        expect((await run('get', `/quiz-practice/attempts/${attemptA}`)).status).toBe(401);
    });

    it('QuizPracticeController.saveAttempt: B writes A attempt -> 404 and the row is unchanged', async () => {
        const before = await t.prisma.quizPracticeAttempt.findUnique({ where: { id: attemptA } });
        expect((await run('put', `/quiz-practice/attempts/${attemptA}`, 'b', progress)).status).toBe(404);
        expect((await run('put', `/quiz-practice/attempts/${attemptA}`, undefined, progress)).status).toBe(401);
        const after = await t.prisma.quizPracticeAttempt.findUnique({ where: { id: attemptA } });
        expect(after).toEqual(before);
    });

    it('QuizPracticeController.submitAttempt: B submits A attempt -> 404, still open for A', async () => {
        expect((await run('post', `/quiz-practice/attempts/${attemptA}/submit`, 'b')).status).toBe(404);
        expect((await run('post', `/quiz-practice/attempts/${attemptA}/submit`)).status).toBe(401);
        const row = await t.prisma.quizPracticeAttempt.findUnique({ where: { id: attemptA } });
        expect(row?.isSubmitted).toBe(false);
    });

    it('QuizPracticeController.listAttempts: B sees only B rows, never A history', async () => {
        await run('post', `/quiz-practice/attempts/${attemptA}/submit`, 'a');
        const bStart = await run('post', '/quiz-practice/attempts', 'b', { quizSetId: setId });
        await run('post', `/quiz-practice/attempts/${bStart.body.attempt.id}/submit`, 'b');
        const listB = await run('get', `/quiz-practice/attempts?quizSetId=${setId}`, 'b');
        expect(listB.status).toBe(200);
        expect(listB.body.attempts.map((x: { id: string }) => x.id)).toEqual([
            bStart.body.attempt.id,
        ]);
        const all = await run('get', '/quiz-practice/attempts', 'b');
        expect(all.body.attempts.map((x: { id: string }) => x.id)).not.toContain(attemptA);
        expect((await run('get', `/quiz-practice/attempts?quizSetId=${setId}`)).status).toBe(401);
    });

    it('QuizPracticeController.startAttempt: a STUDENT with no grant -> 404, TEACHER non-owner -> 403, anonymous -> 401', async () => {
        const body = { quizSetId: setId };
        expect((await run('post', '/quiz-practice/attempts', 'outsider', body)).status).toBe(404);
        expect((await run('post', '/quiz-practice/attempts', 'otherTeacher', body)).status).toBe(403);
        expect((await run('post', '/quiz-practice/attempts', undefined, body)).status).toBe(401);
        expect((await run('post', '/quiz-practice/attempts', 'a', { quizSetId: 'nope' })).status).toBe(404);
        expect((await run('post', '/quiz-practice/attempts', 'a', {})).status).toBe(400);
    });

    it('QuizPracticeController.startAttempt: the TEACHER owner may preview their own set', async () => {
        const res = await run('post', '/quiz-practice/attempts', 'owner', { quizSetId: setId });
        expect([200, 201]).toContain(res.status);
        const id = res.body.attempt.id;
        // and continue it (attempt endpoints are owner-scoped, not quiz:practice)
        expect((await run('put', `/quiz-practice/attempts/${id}`, 'owner', progress)).status).toBe(200);
        expect((await run('get', `/quiz-practice/attempts/${id}`, 'owner')).status).toBe(200);
        expect((await run('post', `/quiz-practice/attempts/${id}/submit`, 'owner')).status).toBe(200);
    });

    it('the granted list is quiz:practice only (TEACHER 403) and holds only my grants', async () => {
        expect((await run('get', '/quiz-practice/sets', 'owner')).status).toBe(403);
        expect((await run('get', '/quiz-practice/sets')).status).toBe(401);
        const mine = await run('get', '/quiz-practice/sets', 'outsider');
        expect(mine.body.sets).toEqual([]);
    });

    it('GET /quiz-practice/sets/:id/access is public: anonymous sees a code prompt only, a bad token is ignored', async () => {
        const coded = (await seedQuizSet(t, owner.id, { accessCode: '482913' })).id;
        const anon = await run('get', `/quiz-practice/sets/${coded}/access`);
        expect(anon.status).toBe(200);
        expect(anon.body).toMatchObject({ canAccess: false, requiresCode: true, reason: null });
        expect(JSON.stringify(anon.body)).not.toContain('482913');
        const junk = await call(t.server, 'get', `/quiz-practice/sets/${coded}/access`, 'not.a.jwt');
        expect(junk.status).toBe(200);
        // owner via token: reason 'owner'
        const asOwner = await run('get', `/quiz-practice/sets/${coded}/access`, 'owner');
        expect(asOwner.body).toMatchObject({ canAccess: true, reason: 'owner' });
        // a private set without a code is not revealed at all
        const hidden = (await seedQuizSet(t, owner.id)).id;
        expect((await run('get', `/quiz-practice/sets/${hidden}/access`, 'outsider')).status).toBe(404);
        expect((await run('get', `/quiz-practice/sets/${rid()}/access`, 'outsider')).status).toBe(404);
    });

    describe('access revoked while an attempt is open (no answer key for someone who lost access)', () => {
        const noKey = (body: unknown) => expect(JSON.stringify(body)).not.toMatch(/correctAnswer|isCorrect/);

        const scenarios: Array<[string, Record<string, unknown>, (id: string) => Promise<unknown>]> = [
            ['code rotated', { accessCode: '482913' }, (id) => run('post', `/quizsets/${id}/generate-code`, 'owner')],
            ['code disabled', { accessCode: '482913' }, (id) => run('put', `/quizsets/${id}/sharing`, 'owner', { codeEnabled: false })],
            ['whitelist removal', { whitelist: [] }, (id) => run('put', `/quizsets/${id}/sharing`, 'owner', { removeUserIds: [a.id] })],
            ['public set made private', { isPublic: true }, (id) => run('put', `/quizsets/${id}/sharing`, 'owner', { isPublic: false })],
        ];

        it.each(scenarios)('%s: GET / save / submit of the open attempt are 404 and reveal nothing', async (name, seed, revoke) => {
            const id = (await seedQuizSet(t, owner.id, seed)).id;
            if (name === 'whitelist removal') await t.prisma.quizSet.update({ where: { id }, data: { whitelist: [a.id] } });
            if ('accessCode' in seed) {
                expect((await run('post', `/quiz-practice/sets/${id}/unlock`, 'a', { code: '482913' })).status).toBe(200);
            }
            const start = await run('post', '/quiz-practice/attempts', 'a', { quizSetId: id });
            expect([200, 201]).toContain(start.status);
            const attemptId = start.body.attempt.id;
            await revoke(id);

            const read = await run('get', `/quiz-practice/attempts/${attemptId}`, 'a');
            const save = await run('put', `/quiz-practice/attempts/${attemptId}`, 'a', progress);
            const submit = await run('post', `/quiz-practice/attempts/${attemptId}/submit`, 'a');
            expect([read.status, save.status, submit.status]).toEqual([404, 404, 404]);
            noKey([read.body, save.body, submit.body]);
            const row = await t.prisma.quizPracticeAttempt.findUniqueOrThrow({ where: { id: attemptId } });
            expect(row.isSubmitted).toBe(false);
            expect(row.answers).toEqual({});
        });

        it('a SUBMITTED attempt stays readable after access is lost; the owner keeps preview access', async () => {
            const id = (await seedQuizSet(t, owner.id, { whitelist: [a.id] })).id;
            const attemptId = (await run('post', '/quiz-practice/attempts', 'a', { quizSetId: id })).body.attempt.id;
            expect((await run('post', `/quiz-practice/attempts/${attemptId}/submit`, 'a')).status).toBe(200);
            await run('put', `/quizsets/${id}/sharing`, 'owner', { removeUserIds: [a.id] });
            const read = await run('get', `/quiz-practice/attempts/${attemptId}`, 'a');
            expect(read.status).toBe(200);
            expect(read.body.attempt.isSubmitted).toBe(true);
            const mine = await run('post', '/quiz-practice/attempts', 'owner', { quizSetId: id });
            expect([200, 201]).toContain(mine.status);
            expect((await run('get', `/quiz-practice/attempts/${mine.body.attempt.id}`, 'owner')).status).toBe(200);
        });
    });

    it('GET /quiz-practice/sets/:id/access: an ANONYMOUS caller learns only that a code is needed (no title, no count)', async () => {
        const coded = (await seedQuizSet(t, owner.id, { accessCode: '482913' })).id;
        const anon = await run('get', `/quiz-practice/sets/${coded}/access`);
        expect(anon.body).toEqual({ canAccess: false, requiresCode: true, reason: null });
        const signedIn = await run('get', `/quiz-practice/sets/${coded}/access`, 'outsider');
        expect(signedIn.body).toMatchObject({ canAccess: false, requiresCode: true, title: expect.any(String), questionCount: 1 });
    });
});
