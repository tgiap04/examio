import { bootAssessmentApp, type AssessmentTestApp } from './support/assessment-test-app';
import { createRoom, createSessionOk } from './support/flows';
import { call } from './support/http';
import { seedQuizSet } from './support/seed';
import { secretKeysIn, student as makeStudent, teacher as makeTeacher, type TokenUser } from './support/users';

/**
 * The JSON-key scan of the contract over every assessment response: students and anonymous callers
 * never see `answer` before the attempt is graded (nor `accessCode`, `whitelist`, `codeGrantedIds`), and
 * no response of any caller carries an `email` or the stored `quizSnapshot`.
 */
describe('assessment response contract: no answer key, secret or email leaks (e2e)', () => {
    let t: AssessmentTestApp;
    let owner: TokenUser;
    let learner: TokenUser;
    let outsider: TokenUser;
    let privateSession: string;
    let publicSession: string;
    let roomId: string;
    const scanned: string[] = [];

    /** Asserts `status` and runs the scan; `allow` lists the keys this caller may legitimately see. */
    async function check(
        method: 'get' | 'post' | 'put',
        path: string,
        who: TokenUser | undefined,
        allow: readonly string[] = [],
        body?: object
    ) {
        const res = await call(t.server, method, path, who?.token, body);
        expect({ path, status: res.status < 400 }).toEqual({ path, status: true });
        expect({ path, leaks: secretKeysIn(res.body, allow) }).toEqual({ path, leaks: [] });
        scanned.push(`${method} ${path}`);
        return res.body;
    }

    beforeAll(async () => {
        t = await bootAssessmentApp();
        owner = await makeTeacher(t);
        learner = await makeStudent(t);
        outsider = await makeStudent(t);
        const quiz = await seedQuizSet(t, owner.id, ['Part A'], [
            { question: 'Q1', label: 'Part A', answer: 'A' },
            { question: 'Q2', answer: 'B' },
        ]);
        roomId = await createRoom(t, owner, quiz.id);
        privateSession = (
            await createSessionOk(t, owner, roomId, { assessType: 1, accessCode: '482910', whitelist: [learner.id] })
        ).id;
        publicSession = (await createSessionOk(t, owner, roomId, { assessType: 0 })).id;
    });
    afterAll(() => t?.close());

    it('anonymous and student reads of sessions and rooms', async () => {
        await check('get', `/examsessions/get-public/${publicSession}`, undefined);
        await check('get', `/examsessions/study/${publicSession}/info`, undefined);
        await check('get', `/examsessions/study/${privateSession}/info`, undefined);
        await check('get', `/examsessions/study/${privateSession}/access`, learner);
        await check('get', `/examsessions/study/${privateSession}`, learner);
        await check('get', `/examsessions/study/${publicSession}`, outsider);
        await check('get', `/examsessions/study/${privateSession}/stats`, learner);
        await check('get', `/examrooms/get-public/${roomId}`, outsider);
        await check('post', `/examsessions/study/${privateSession}/with-code`, outsider, [], { accessCode: '482910' });
        await check('post', `/examsessions/study/${privateSession}/verify-code`, outsider, [], { accessCode: '482910' });
    });

    it('the whole attempt flow: start, quiz, secure-quiz, progress, get-by-id, detail, lists', async () => {
        const start = await check('post', '/examattempts/start', learner, [], { examSessionId: privateSession });
        const attemptId = start.examAttempt.id as string;
        await check('get', `/examattempts/${attemptId}/quiz`, learner);
        await check('get', `/examattempts/${attemptId}/secure-quiz`, learner);
        await check('put', `/examattempts/${attemptId}/progress`, learner, [], { currentIndex: 1, markedQuestions: [] });
        await check('get', `/examattempts/get-by-id/${attemptId}`, learner);
        await check('get', `/examattempts/${attemptId}/detail`, learner);
        await check('get', '/examattempts/list', learner);
        await check('get', '/student/recent-exams', learner);
        await check('post', `/student/pin-exam-room/${roomId}`, learner);
        await check('get', '/examattempts/history-stats', learner);
        await check('post', '/cheatinglogs', learner, [], { examAttemptId: attemptId, type: 'TAB_SWITCH' });

        // only after the grade does the key come back, and only the one the session allows
        const submitted = await call(t.server, 'post', `/examattempts/${attemptId}/submit`, learner.token);
        expect(submitted.status).toBeLessThan(300);
        expect(secretKeysIn(submitted.body, ['answer'])).toEqual([]);
        expect(JSON.stringify(submitted.body)).toContain('"answer"');
        const after = await check('get', `/examattempts/get-by-id/${attemptId}`, learner, ['answer']);
        expect(JSON.stringify(after)).toContain('"answer"');
    });

    it('a session that hides answers after submit never sends the key, not even to the examinee', async () => {
        const hidden = (await createSessionOk(t, owner, roomId, { assessType: 0, showAnswersAfterSubmit: false })).id;
        const start = await call(t.server, 'post', '/examattempts/start', outsider.token, { examSessionId: hidden });
        const attemptId = start.body.examAttempt.id as string;
        const submitted = await call(t.server, 'post', `/examattempts/${attemptId}/submit`, outsider.token);
        expect(submitted.status).toBeLessThan(300);
        expect(secretKeysIn(submitted.body)).toEqual([]);
        await check('get', `/examattempts/get-by-id/${attemptId}`, outsider);
        await check('get', `/examattempts/${attemptId}/detail`, outsider);
    });

    it('host views keep their secrets (code, whitelist, answers) but never an email or the snapshot column', async () => {
        const hostAllowed = ['answer', 'accessCode', 'whitelist', 'codeGrantedIds'];
        await check('get', `/examsessions/get-by-id/${privateSession}`, owner, hostAllowed);
        await check('get', `/examsessions/${privateSession}/sharing`, owner, hostAllowed);
        await check('get', `/examsessions/list`, owner, hostAllowed);
        await check('get', `/examrooms/detail/${roomId}`, owner, hostAllowed);
        await check('get', `/examrooms/${roomId}/sessions`, owner, hostAllowed);
        await check('get', '/examrooms/list', owner, hostAllowed);
        await check('get', `/examattempts/list-by-room/${roomId}`, owner, hostAllowed);
        await check('get', `/examattempts/list-by-session/${privateSession}`, owner, hostAllowed);
        await check('get', `/examsessions/room/${roomId}/available-labels`, owner, hostAllowed);
        await check('get', `/examsessions/room/${roomId}/available-labels?sessionId=${privateSession}`, owner, hostAllowed);
        await check('post', `/examsessions/${publicSession}/refresh-snapshot`, owner, hostAllowed);
        expect(scanned.length).toBeGreaterThan(30);
    });
});
