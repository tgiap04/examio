import {
    bootExamApp,
    type ExamTestApp,
    type TestUser,
} from './support/exam-test-app';
import { call, keysDeep } from './support/http';
import { seedAttempt, seedExamRoom, seedExamSession } from './support/seed';

const CODE = '905817';

/** What an examinee / host may read back about an attempt (no sharing secrets, answers gated). */
describe('examattempt response views (e2e)', () => {
    let t: ExamTestApp;
    let host: TestUser;
    let student: TestUser;
    let roomId: string;
    const tok: Record<string, string> = {};

    beforeAll(async () => {
        t = await bootExamApp();
        host = await t.createUser(['TEACHER']);
        student = await t.createUser(['STUDENT']);
        tok.host = await t.tokenFor(host);
        tok.student = await t.tokenFor(student);
        roomId = (await seedExamRoom(t, host.id)).id;
    });
    afterAll(() => t.close());

    const noSecrets = (body: unknown) => {
        const keys = keysDeep(body);
        expect(keys.has('accessCode')).toBe(false);
        expect(keys.has('whitelist')).toBe(false);
        expect(JSON.stringify(body)).not.toContain(CODE);
    };

    it('examinee responses never carry accessCode or whitelist: start, create, get-by-id, detail, list, update', async () => {
        const session = await seedExamSession(t, roomId, {
            assessType: 1,
            accessCode: CODE,
            whitelist: [student.id],
            allowRetake: true,
        });
        const started = await call(
            t.server,
            'post',
            '/examattempts/start',
            tok.student,
            { examSessionId: session }
        );
        expect(started.status).toBe(201);
        noSecrets(started.body);

        const resumed = await call(
            t.server,
            'post',
            '/examattempts/start',
            tok.student,
            { examSessionId: session }
        );
        noSecrets(resumed.body);
        const attemptId = started.body.examAttempt.id;

        const byId = await call(
            t.server,
            'get',
            `/examattempts/get-by-id/${attemptId}`,
            tok.student
        );
        expect(byId.status).toBe(200);
        noSecrets(byId.body);

        const detail = await call(
            t.server,
            'get',
            `/examattempts/${attemptId}/detail`,
            tok.student
        );
        expect(detail.status).toBe(200);
        noSecrets(detail.body);

        noSecrets(
            (await call(t.server, 'get', '/examattempts/list', tok.student))
                .body
        );
        noSecrets(
            (
                await call(
                    t.server,
                    'put',
                    `/examattempts/${attemptId}`,
                    tok.student,
                    {}
                )
            ).body
        );

        const other = await seedExamSession(t, roomId, { assessType: 0 });
        const created = await call(
            t.server,
            'post',
            '/examattempts',
            tok.student,
            { examSessionId: other }
        );
        expect(created.status).toBe(201);
        noSecrets(created.body);
        // the picked fields the FE needs are still there
        expect(byId.body.examSession).toMatchObject({
            id: session,
            maxAttempts: 1,
            showAnswersAfterSubmit: true,
        });
        expect(byId.body.user).toMatchObject({ id: student.id });
    });

    it('the host view of an attempt does not carry the sharing secrets either', async () => {
        const session = await seedExamSession(t, roomId, {
            assessType: 1,
            accessCode: CODE,
            whitelist: [student.id],
        });
        const attemptId = await seedAttempt(t, session, student.id);
        const res = await call(
            t.server,
            'get',
            `/examattempts/get-by-id/${attemptId}`,
            tok.host
        );
        expect(res.status).toBe(200);
        noSecrets(res.body);
    });

    describe.each([
        [true, 'shows'],
        [false, 'hides'],
    ])('showAnswersAfterSubmit=%s', (flag, verb) => {
        let attemptId: string;
        beforeAll(async () => {
            const session = await seedExamSession(t, roomId, {
                assessType: 0,
                showAnswersAfterSubmit: flag,
            });
            attemptId = await seedAttempt(t, session, student.id, 1); // COMPLETED
        });

        it(`a COMPLETED attempt ${verb} the answer key for the examinee (get-by-id and detail)`, async () => {
            const byId = await call(
                t.server,
                'get',
                `/examattempts/get-by-id/${attemptId}`,
                tok.student
            );
            const detail = await call(
                t.server,
                'get',
                `/examattempts/${attemptId}/detail`,
                tok.student
            );
            expect(keysDeep(byId.body).has('answer')).toBe(flag);
            expect(keysDeep(detail.body).has('answer')).toBe(flag);
        });

        it('the host always sees the answer key', async () => {
            const byId = await call(
                t.server,
                'get',
                `/examattempts/get-by-id/${attemptId}`,
                tok.host
            );
            const detail = await call(
                t.server,
                'get',
                `/examattempts/${attemptId}/detail`,
                tok.host
            );
            expect(keysDeep(byId.body).has('answer')).toBe(true);
            expect(keysDeep(detail.body).has('answer')).toBe(true);
        });
    });
});
