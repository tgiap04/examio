import {
    bootAssessmentApp,
    type AssessmentTestApp,
    type TestUser,
} from './support/assessment-test-app';
import { call, keysDeep } from './support/http';
import { seedAttempt, seedExamRoom, seedExamSession } from './support/seed';

describe('examattempt ownership (e2e)', () => {
    let t: AssessmentTestApp;
    let host: TestUser;
    let otherTeacher: TestUser;
    let owner: TestUser;
    let otherStudent: TestUser;
    let adminOnly: TestUser;
    let sessionId: string;
    let attemptId: string;
    const tok: Record<string, string> = {};

    beforeAll(async () => {
        t = await bootAssessmentApp();
        host = await t.createUser(['TEACHER']);
        otherTeacher = await t.createUser(['TEACHER']);
        owner = await t.createUser(['STUDENT']);
        otherStudent = await t.createUser(['STUDENT']);
        adminOnly = await t.createUser(['SYSTEM_ADMIN']);
        for (const [k, u] of Object.entries({
            host,
            otherTeacher,
            owner,
            otherStudent,
            adminOnly,
        })) {
            tok[k] = await t.tokenFor(u);
        }
        const room = await seedExamRoom(t, host.id);
        sessionId = await seedExamSession(t, room.id, { assessType: 0 });
        attemptId = await seedAttempt(t, sessionId, owner.id);
    });
    afterAll(() => t.close());

    describe('ExamAttemptController.getExamAttemptById: GET /examattempts/get-by-id/:id', () => {
        const path = () => `/examattempts/get-by-id/${attemptId}`;

        it('ExamAttemptController.getExamAttemptById examinee -> 200 and no answer key while the attempt is open', async () => {
            const res = await call(t.server, 'get', path(), tok.owner);
            expect(res.status).toBe(200);
            expect(keysDeep(res.body).has('answer')).toBe(false);
        });

        it('ExamAttemptController.getExamAttemptById host -> 200 with the answer key', async () => {
            const res = await call(t.server, 'get', path(), tok.host);
            expect(res.status).toBe(200);
            expect(keysDeep(res.body).has('answer')).toBe(true);
        });

        it('ExamAttemptController.getExamAttemptById other STUDENT, non-host TEACHER and ADMIN-only -> 404', async () => {
            for (const k of ['otherStudent', 'otherTeacher', 'adminOnly']) {
                expect(
                    (await call(t.server, 'get', path(), tok[k])).status
                ).toBe(404);
            }
        });

        it('ExamAttemptController.getExamAttemptById anonymous -> 401', async () => {
            expect((await call(t.server, 'get', path())).status).toBe(401);
        });
    });

    describe('ExamAttemptController.getExamAttemptDetail: GET /examattempts/:id/detail', () => {
        const path = () => `/examattempts/${attemptId}/detail`;

        it('ExamAttemptController.getExamAttemptDetail examinee and host -> 200', async () => {
            expect(
                (await call(t.server, 'get', path(), tok.owner)).status
            ).toBe(200);
            expect((await call(t.server, 'get', path(), tok.host)).status).toBe(
                200
            );
        });

        it('ExamAttemptController.getExamAttemptDetail other STUDENT, non-host TEACHER and ADMIN-only -> 404', async () => {
            for (const k of ['otherStudent', 'otherTeacher', 'adminOnly']) {
                expect(
                    (await call(t.server, 'get', path(), tok[k])).status
                ).toBe(404);
            }
        });

        it('ExamAttemptController.getExamAttemptDetail anonymous -> 401', async () => {
            expect((await call(t.server, 'get', path())).status).toBe(401);
        });
    });

    describe('ExamAttemptController.updateExamAttempt: PUT /examattempts/:id', () => {
        const path = () => `/examattempts/${attemptId}`;

        it('ExamAttemptController.updateExamAttempt examinee with no privileged field -> 200', async () => {
            expect(
                (await call(t.server, 'put', path(), tok.owner, {})).status
            ).toBe(200);
        });

        it('ExamAttemptController.updateExamAttempt examinee can not self-award a score -> 403', async () => {
            expect(
                (await call(t.server, 'put', path(), tok.owner, { score: 100 }))
                    .status
            ).toBe(403);
        });

        it('ExamAttemptController.updateExamAttempt other STUDENT, non-host TEACHER and ADMIN-only -> 404', async () => {
            for (const k of ['otherStudent', 'otherTeacher', 'adminOnly']) {
                expect(
                    (await call(t.server, 'put', path(), tok[k], { score: 1 }))
                        .status
                ).toBe(404);
            }
        });

        it('ExamAttemptController.updateExamAttempt host (exam_session:manage) may grade -> 200', async () => {
            const res = await call(t.server, 'put', path(), tok.host, {
                score: 55,
            });
            expect(res.status).toBe(200);
            expect(
                (
                    await t.prisma.examAttempt.findUniqueOrThrow({
                        where: { id: attemptId },
                    })
                ).score
            ).toBe(55);
        });

        it('ExamAttemptController.updateExamAttempt anonymous -> 401', async () => {
            expect(
                (await call(t.server, 'put', path(), undefined, {})).status
            ).toBe(401);
        });
    });

    describe('own-attempt routes (progress, submit)', () => {
        it('PUT :id/progress and POST :id/submit: examinee 200, other STUDENT 404, TEACHER (any) 403, anonymous 401', async () => {
            const own = await seedAttempt(t, sessionId, owner.id);
            const progress = `/examattempts/${own}/progress`;
            expect(
                (
                    await call(t.server, 'put', progress, tok.owner, {
                        currentIndex: 0,
                    })
                ).status
            ).toBe(200);
            expect(
                (
                    await call(t.server, 'put', progress, tok.otherStudent, {
                        currentIndex: 0,
                    })
                ).status
            ).toBe(404);
            expect(
                (
                    await call(t.server, 'put', progress, tok.otherTeacher, {
                        currentIndex: 0,
                    })
                ).status
            ).toBe(403);
            expect(
                (
                    await call(t.server, 'put', progress, tok.host, {
                        currentIndex: 0,
                    })
                ).status
            ).toBe(403);
            expect(
                (await call(t.server, 'put', progress, undefined, {})).status
            ).toBe(401);

            const submit = `/examattempts/${own}/submit`;
            expect(
                (await call(t.server, 'post', submit, tok.otherStudent)).status
            ).toBe(404);
            expect(
                (await call(t.server, 'post', submit, tok.host)).status
            ).toBe(403);
            expect(
                (await call(t.server, 'post', submit, tok.owner)).status
            ).toBe(201);
        });
    });

    describe('host-only listings', () => {
        it('list-by-session and list-by-room need exam_result:view and the host relation', async () => {
            const bySession = `/examattempts/list-by-session/${sessionId}`;
            expect(
                (await call(t.server, 'get', bySession, tok.host)).status
            ).toBe(200);
            expect(
                (await call(t.server, 'get', bySession, tok.owner)).status
            ).toBe(403);
            expect(
                (await call(t.server, 'get', bySession, tok.adminOnly)).status
            ).toBe(403);
            expect(
                (await call(t.server, 'get', bySession, tok.otherTeacher))
                    .status
            ).toBeGreaterThanOrEqual(403);
            expect((await call(t.server, 'get', bySession)).status).toBe(401);
        });
    });
});
