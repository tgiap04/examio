import {
    bootExamApp,
    rid,
    type ExamTestApp,
    type TestUser,
} from './ownership/support/exam-test-app';
import { call, keysDeep } from './ownership/support/http';

const ANSWERS = ['Paris', 'Rome', 'Oslo'];

/** A quiz set with 3 questions (keys Paris, Rome, Oslo). */
async function seedSet(t: ExamTestApp, ownerId: string, over: object = {}) {
    const id = `qs_${rid()}`;
    await t.prisma.quizSet.create({
        data: { id, title: `set ${id}`, userId: ownerId, ...over } as never,
    });
    const questionIds: string[] = [];
    for (const answer of ANSWERS) {
        const q = await t.prisma.quizQuestion.create({
            data: {
                id: `qq_${rid()}`,
                question: `Q ${answer}`,
                options: [...ANSWERS, 'Bern'],
                answer,
            },
        });
        await t.prisma.detailsQuizQuestion.create({
            data: { quizSetId: id, quizQuestionId: q.id },
        });
        questionIds.push(q.id);
    }
    return { id, questionIds };
}

describe('quiz sharing and student practice (e2e)', () => {
    let t: ExamTestApp;
    let teacher: TestUser;
    let student: TestUser;
    let whitelisted: TestUser;
    const tok: Record<string, string> = {};
    let setId: string;
    let questionIds: string[];
    let code: string;
    const get = (p: string, who: string) => call(t.server, 'get', p, tok[who]);
    const post = (p: string, who: string | undefined, b?: object) =>
        call(t.server, 'post', p, who ? tok[who] : undefined, b ?? {});
    const put = (p: string, who: string, b: object) =>
        call(t.server, 'put', p, tok[who], b);
    const listed = async (who: string, id = setId) =>
        ((await get('/quiz-practice/sets', who)).body.sets as { id: string }[])
            .some((s) => s.id === id);

    beforeAll(async () => {
        t = await bootExamApp();
        teacher = await t.createUser(['TEACHER']);
        student = await t.createUser(['STUDENT']);
        whitelisted = await t.createUser(['STUDENT']);
        for (const [k, u] of Object.entries({ teacher, student, whitelisted }))
            tok[k] = await t.tokenFor(u);
        ({ id: setId, questionIds } = await seedSet(t, teacher.id));
    });
    afterAll(() => t.close());

    it('teacher turns the code on: a 6-digit code, lists empty, no email anywhere', async () => {
        const res = await put(`/quizsets/${setId}/sharing`, 'teacher', {
            codeEnabled: true,
        });
        expect(res.status).toBe(200);
        code = res.body.accessCode;
        expect(code).toMatch(/^\d{6}$/);
        expect(res.body).toMatchObject({
            isPublic: false,
            whitelist: [],
            codeGranted: [],
        });
        const again = await put(`/quizsets/${setId}/sharing`, 'teacher', {
            codeEnabled: true,
        });
        expect(again.body.accessCode).toBe(code); // enabling again keeps the code
    });

    it('a student with no grant sees a code prompt, not the set; wrong code is 400 INVALID_CODE', async () => {
        expect(await listed('student')).toBe(false);
        const access = await call(
            t.server,
            'get',
            `/quiz-practice/sets/${setId}/access`,
            tok.student
        );
        expect(access.body).toEqual({
            title: expect.any(String),
            questionCount: 3,
            canAccess: false,
            requiresCode: true,
            reason: null,
        });
        const bad = await post(`/quiz-practice/sets/${setId}/unlock`, 'student', {
            code: code === '000000' ? '111111' : '000000',
        });
        expect(bad.status).toBe(400);
        expect(bad.body.code).toBe('INVALID_CODE');
        const start = await post('/quiz-practice/attempts', 'student', {
            quizSetId: setId,
        });
        expect(start.status).toBe(404);
    });

    it('unlock needs a login and quiz:practice (anonymous 401, TEACHER 403)', async () => {
        const p = `/quiz-practice/sets/${setId}/unlock`;
        expect((await post(p, undefined, { code })).status).toBe(401);
        expect((await post(p, 'teacher', { code })).status).toBe(403);
    });

    it('the right code unlocks once; the set is then granted and never asks again', async () => {
        const ok = await post(`/quiz-practice/sets/${setId}/unlock`, 'student', {
            code,
        });
        expect(ok.status).toBe(200);
        expect(ok.body).toEqual({ canAccess: true });
        const access = await get(`/quiz-practice/sets/${setId}/access`, 'student');
        expect(access.body).toMatchObject({ canAccess: true, reason: 'code' });
        const list = (await get('/quiz-practice/sets', 'student')).body;
        const mine = list.sets.find((s: { id: string }) => s.id === setId);
        expect(mine).toMatchObject({ questionCount: 3, owner: { name: expect.any(String) } });
        expect(Object.keys(mine).sort()).toEqual(
            ['description', 'id', 'lastAttempt', 'owner', 'questionCount', 'thumbnail', 'title'].sort()
        );
        const sharing = (await get(`/quizsets/${setId}/sharing`, 'teacher')).body;
        expect(sharing.codeGranted.map((u: { id: string }) => u.id)).toEqual([student.id]);
        expect(JSON.stringify(sharing)).not.toMatch(/email/);
    });

    it('start returns questions with NO answer fields; starting twice resumes the same attempt', async () => {
        const first = await post('/quiz-practice/attempts', 'student', { quizSetId: setId });
        expect([200, 201]).toContain(first.status);
        expect(first.body.questions).toHaveLength(3);
        const keys = keysDeep(first.body);
        for (const banned of ['answer', 'correctAnswer', 'correctAnswers', 'isCorrect', 'score', 'userId'])
            expect(keys.has(banned)).toBe(false);
        const second = await post('/quiz-practice/attempts', 'student', { quizSetId: setId });
        expect(second.body.attempt.id).toBe(first.body.attempt.id);
    });

    it('autosave keeps the progress and still leaks nothing; reading it back shows no keys', async () => {
        const attempt = (await post('/quiz-practice/attempts', 'student', { quizSetId: setId })).body.attempt;
        const saved = await put(`/quiz-practice/attempts/${attempt.id}`, 'student', {
            answers: { [questionIds[0]]: 'Paris', [questionIds[1]]: 'Bern' },
            currentIndex: 2,
            markedQuestions: [questionIds[1]],
            timeSpentSeconds: 41,
        });
        expect(saved.status).toBe(200);
        const read = await get(`/quiz-practice/attempts/${attempt.id}`, 'student');
        expect(read.body.attempt).toMatchObject({
            currentIndex: 2,
            markedQuestions: [questionIds[1]],
            timeSpentSeconds: 41,
            isSubmitted: false,
        });
        expect(read.body.attempt.answers).toEqual({
            [questionIds[0]]: 'Paris',
            [questionIds[1]]: 'Bern',
        });
        const keys = keysDeep(read.body);
        for (const banned of ['answer', 'correctAnswer', 'isCorrect'])
            expect(keys.has(banned)).toBe(false);
        const resumed = await post('/quiz-practice/attempts', 'student', { quizSetId: setId });
        expect(resumed.body.attempt).toMatchObject({ id: attempt.id, currentIndex: 2 });
    });

    it('rejects a malformed autosave body (400) without touching the row', async () => {
        const attempt = (await post('/quiz-practice/attempts', 'student', { quizSetId: setId })).body.attempt;
        const p = `/quiz-practice/attempts/${attempt.id}`;
        for (const bad of [
            { answers: 'x', currentIndex: 0, markedQuestions: [], timeSpentSeconds: 0 },
            { answers: {}, currentIndex: -1, markedQuestions: [], timeSpentSeconds: 0 },
            { answers: {}, currentIndex: 0, markedQuestions: [], timeSpentSeconds: -5 },
        ])
            expect((await put(p, 'student', bad)).status).toBe(400);
    });

    it('submit scores from the stored answers (client score ignored) and reveals the key; double submit is 409', async () => {
        const attempt = (await post('/quiz-practice/attempts', 'student', { quizSetId: setId })).body.attempt;
        const res = await post(`/quiz-practice/attempts/${attempt.id}/submit`, 'student', {
            score: 10,
            correctAnswers: 3,
        });
        expect(res.status).toBe(200);
        expect(res.body.attempt).toMatchObject({
            isSubmitted: true,
            score: 3.33,
            correctAnswers: 1,
            totalQuestions: 3,
        });
        const byId = new Map<string, { correctAnswer: string; isCorrect: boolean; selectedAnswer?: string }>(
            res.body.questions.map((q: { id: string }) => [q.id, q])
        );
        expect(byId.get(questionIds[0])).toMatchObject({ correctAnswer: 'Paris', isCorrect: true });
        expect(byId.get(questionIds[1])).toMatchObject({ correctAnswer: 'Rome', isCorrect: false, selectedAnswer: 'Bern' });
        expect(byId.get(questionIds[2])).toMatchObject({ correctAnswer: 'Oslo', isCorrect: false });

        const again = await post(`/quiz-practice/attempts/${attempt.id}/submit`, 'student');
        expect(again.status).toBe(409);
        expect(again.body.code).toBe('ALREADY_SUBMITTED');
        const edit = await put(`/quiz-practice/attempts/${attempt.id}`, 'student', {
            answers: {}, currentIndex: 0, markedQuestions: [], timeSpentSeconds: 1,
        });
        expect(edit.status).toBe(409);
        const read = await get(`/quiz-practice/attempts/${attempt.id}`, 'student');
        expect(read.body.questions[0]).toHaveProperty('correctAnswer');

        const history = await get(`/quiz-practice/attempts?quizSetId=${setId}`, 'student');
        expect(history.body.attempts).toHaveLength(1);
        expect(history.body.attempts[0]).toMatchObject({ id: attempt.id, score: 3.33 });
        // a new start after submitting opens a fresh attempt (history can grow)
        const next = await post('/quiz-practice/attempts', 'student', { quizSetId: setId });
        expect(next.body.attempt.id).not.toBe(attempt.id);
    });

    it('whitelist grants and revokes through the delta PUT; the code-granted student is unaffected', async () => {
        await put(`/quizsets/${setId}/sharing`, 'teacher', { addUserIds: [whitelisted.id] });
        expect(await listed('whitelisted')).toBe(true);
        expect((await get(`/quiz-practice/sets/${setId}/access`, 'whitelisted')).body.reason).toBe('whitelist');
        const removed = await put(`/quizsets/${setId}/sharing`, 'teacher', { removeUserIds: [whitelisted.id] });
        expect(removed.body.whitelist).toEqual([]);
        expect(await listed('whitelisted')).toBe(false);
        expect(await listed('student')).toBe(true);
    });

    it('rotating the code evicts code-granted students but keeps whitelisted ones', async () => {
        await put(`/quizsets/${setId}/sharing`, 'teacher', { addUserIds: [whitelisted.id] });
        const rot = await post(`/quizsets/${setId}/generate-code`, 'teacher');
        expect(rot.status).toBeLessThan(300);
        expect(rot.body.accessCode).toMatch(/^\d{6}$/);
        expect(await listed('student')).toBe(false);
        expect(await listed('whitelisted')).toBe(true);
        const access = (await get(`/quiz-practice/sets/${setId}/access`, 'student')).body;
        expect(access).toMatchObject({ canAccess: false, requiresCode: true });
        // the old code no longer works, the new one does
        const oldCode = code;
        code = rot.body.accessCode;
        if (oldCode !== code)
            expect((await post(`/quiz-practice/sets/${setId}/unlock`, 'student', { code: oldCode })).status).toBe(400);
        expect((await post(`/quiz-practice/sets/${setId}/unlock`, 'student', { code })).status).toBe(200);
        expect(await listed('student')).toBe(true);
    });

    it('disabling the code evicts code-granted students, clears the code, keeps the whitelist', async () => {
        const res = await put(`/quizsets/${setId}/sharing`, 'teacher', { codeEnabled: false });
        expect(res.body).toMatchObject({ accessCode: null, codeGranted: [] });
        expect(res.body.whitelist.map((u: { id: string }) => u.id)).toEqual([whitelisted.id]);
        expect(await listed('student')).toBe(false);
        expect(await listed('whitelisted')).toBe(true);
        // no code and no grant: the set is not even revealed
        expect((await get(`/quiz-practice/sets/${setId}/access`, 'student')).status).toBe(404);
    });

    it('five wrong codes lock the user out (429 CODE_LOCKED), even for the right code', async () => {
        const locked = await seedSet(t, teacher.id, { accessCode: '482913' });
        const p = `/quiz-practice/sets/${locked.id}/unlock`;
        for (let i = 0; i < 4; i++)
            expect((await post(p, 'student', { code: '000001' })).status).toBe(400);
        const fifth = await post(p, 'student', { code: '000001' });
        expect(fifth.status).toBe(429);
        expect(fifth.body.code).toBe('CODE_LOCKED');
        const right = await post(p, 'student', { code: '482913' });
        expect(right.status).toBe(429);
        expect(await listed('student', locked.id)).toBe(false);
    });

    it('a public set opens for any student and lists once they have an attempt', async () => {
        const pub = await seedSet(t, teacher.id, { isPublic: true });
        expect(await listed('student', pub.id)).toBe(false);
        expect((await get(`/quiz-practice/sets/${pub.id}/access`, 'student')).body).toMatchObject({
            canAccess: true,
            reason: 'public',
        });
        const start = await post('/quiz-practice/attempts', 'student', { quizSetId: pub.id });
        expect([200, 201]).toContain(start.status);
        expect(await listed('student', pub.id)).toBe(true);
    });

    it('a submitted result is a snapshot: the teacher editing the question or its key afterwards changes nothing', async () => {
        const fresh = await seedSet(t, teacher.id, { whitelist: [student.id] });
        const started = await post('/quiz-practice/attempts', 'student', { quizSetId: fresh.id });
        const attemptId = started.body.attempt.id;
        await put(`/quiz-practice/attempts/${attemptId}`, 'student', {
            answers: { [fresh.questionIds[0]]: 'Paris', [fresh.questionIds[1]]: 'Rome' },
            currentIndex: 2, markedQuestions: [], timeSpentSeconds: 3,
        });
        const submitted = await post(`/quiz-practice/attempts/${attemptId}/submit`, 'student');
        expect(submitted.body.attempt.score).toBe(6.67);
        await t.prisma.quizQuestion.update({ where: { id: fresh.questionIds[0] }, data: { answer: 'Rome', question: 'EDITED' } });
        await t.prisma.quizQuestion.update({ where: { id: fresh.questionIds[1] }, data: { answer: 'Oslo' } });
        const again = await get(`/quiz-practice/attempts/${attemptId}`, 'student');
        expect(again.status).toBe(200);
        expect(again.body.attempt).toMatchObject({ score: 6.67, correctAnswers: 2 });
        expect(again.body.questions).toEqual(submitted.body.questions);
        expect(JSON.stringify(again.body)).not.toContain('EDITED');
        // history rows carry the stored score too
        const hist = await get(`/quiz-practice/attempts?quizSetId=${fresh.id}`, 'student');
        expect(hist.body.attempts[0].score).toBe(6.67);
    });
});
