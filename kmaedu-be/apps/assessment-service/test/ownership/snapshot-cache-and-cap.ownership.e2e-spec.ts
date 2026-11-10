import { SnapshotStore } from '../../src/modules/snapshot/snapshot.store';
import { bootAssessmentApp, type AssessmentTestApp } from './support/assessment-test-app';
import { createRoom, createSession, createSessionOk, editQuestion } from './support/flows';
import { call } from './support/http';
import { seedAttempt, seedQuizSet } from './support/seed';
import { student as makeStudent, teacher as makeTeacher, type TokenUser } from './support/users';

const MB = 1024 * 1024;

describe('snapshot cache, field selection and the 1 MB cap (e2e)', () => {
    let t: AssessmentTestApp;
    let owner: TokenUser;
    let learner: TokenUser;

    beforeAll(async () => {
        t = await bootAssessmentApp();
        owner = await makeTeacher(t);
        learner = await makeStudent(t);
    });
    afterAll(() => t?.close());

    /** The client the snapshot store reads with (the modules each provide their own PrismaService instance). */
    const storeClient = () => (t.app.get(SnapshotStore) as unknown as { prisma: AssessmentTestApp['prisma'] }).prisma;

    /** Every read of the snapshot COLUMN goes through `examSession.findUnique({ select: { quizSnapshot: true } })`. */
    const snapshotReads = (spy: jest.SpyInstance) =>
        spy.mock.calls.filter((c) => (c[0] as { select?: { quizSnapshot?: boolean } })?.select?.quizSnapshot).length;

    describe('cache', () => {
        it('two GET :id/quiz within 5 minutes read the column ONCE', async () => {
            const quiz = await seedQuizSet(t, owner.id, [], [{ question: 'Q1', answer: 'A' }, { question: 'Q2', answer: 'B' }]);
            const roomId = await createRoom(t, owner, quiz.id);
            const session = await createSessionOk(t, owner, roomId);
            // an attempt written straight to the table: nothing has loaded this session's snapshot yet (cold cache)
            const attemptId = await seedAttempt(t, session.id, learner.id);

            const spy = jest.spyOn(storeClient().examSession, 'findUnique');
            try {
                spy.mockClear();
                const first = await call(t.server, 'get', `/examattempts/${attemptId}/quiz`, learner.token);
                const second = await call(t.server, 'get', `/examattempts/${attemptId}/quiz`, learner.token);
                expect(first.status).toBe(200);
                expect(first.body.questions).toHaveLength(2);
                expect(second.body.questions).toEqual(first.body.questions);
                expect(snapshotReads(spy)).toBe(1);
            } finally {
                spy.mockRestore();
            }
        });

        it('a cold process reads the column once for N exam-time reads, and a refreshed session is read again under its new hash', async () => {
            const quiz = await seedQuizSet(t, owner.id, [], [{ question: 'Q1', answer: 'A' }]);
            const roomId = await createRoom(t, owner, quiz.id);
            const upcoming = new Date(Date.now() + 3_600_000).toISOString();
            const session = await createSessionOk(t, owner, roomId, { startTime: upcoming });
            await t.prisma.examSession.update({ where: { id: session.id }, data: { startTime: new Date(Date.now() - 60_000) } });
            const spy = jest.spyOn(storeClient().examSession, 'findUnique');
            try {
                // study view is an exam-time reader that does not start an attempt
                const study = () => call(t.server, 'get', `/examsessions/study/${session.id}`, learner.token);
                spy.mockClear();
                for (let i = 0; i < 3; i++) expect((await study()).status).toBe(200);
                expect(snapshotReads(spy)).toBe(1);

                editQuestion(t, quiz.id, quiz.questionIds[0], { question: 'Q1 v2' });
                expect((await call(t.server, 'post', `/examsessions/${session.id}/refresh-snapshot`, owner.token)).status).toBe(200);
                spy.mockClear();
                const afterRefresh = await study();
                await study();
                expect(afterRefresh.body.questions[0].question).toBe('Q1 v2');
                expect(snapshotReads(spy)).toBe(1);
            } finally {
                spy.mockRestore();
            }
        });
    });

    describe('field selection: lists never carry the snapshot', () => {
        it('every list / host / student read answers without the snapshot, however deep', async () => {
            const quiz = await seedQuizSet(t, owner.id, [], [{ question: 'Q1', answer: 'A' }]);
            const roomId = await createRoom(t, owner, quiz.id);
            const session = await createSessionOk(t, owner, roomId);
            await call(t.server, 'post', '/examattempts/start', learner.token, { examSessionId: session.id });
            const paths: Array<[string, TokenUser]> = [
                ['/examsessions/list', owner],
                [`/examsessions/get-by-id/${session.id}`, owner],
                [`/examrooms/${roomId}/sessions`, owner],
                [`/examrooms/detail/${roomId}`, owner],
                ['/examrooms/list', owner],
                ['/examrooms/list-all', owner],
                ['/student/recent-exams', learner],
                ['/examattempts/list', learner],
                [`/examattempts/list-by-room/${roomId}`, owner],
                [`/examsessions/get-public/${session.id}`, learner],
            ];
            for (const [path, who] of paths) {
                const res = await call(t.server, 'get', path, who.token);
                expect({ path, status: res.status }).toEqual({ path, status: 200 });
                expect({ path, leaked: JSON.stringify(res.body).includes('quizSnapshot"') }).toEqual({ path, leaked: false });
            }
        });
    });

    describe('size cap', () => {
        const huge = 'x'.repeat(Math.floor(1.1 * MB));

        it('a 1.1 MB quiz is 422 QUIZSET_TOO_LARGE on session create, and no session row is written', async () => {
            const quiz = await seedQuizSet(t, owner.id, [], [{ question: huge, answer: 'A' }]);
            const roomId = await createRoom(t, owner, quiz.id);
            const res = await createSession(t, owner, roomId);
            expect(res.status).toBe(422);
            expect(res.body.code).toBe('QUIZSET_TOO_LARGE');
            expect(await t.prisma.examSession.count({ where: { examRoomId: roomId } })).toBe(0);
        });

        it('and 422 on refresh when the set grew past the cap after the session was made; the snapshot stays', async () => {
            const quiz = await seedQuizSet(t, owner.id, [], [{ question: 'small', answer: 'A' }]);
            const roomId = await createRoom(t, owner, quiz.id);
            const session = await createSessionOk(t, owner, roomId, { startTime: new Date(Date.now() + 3_600_000).toISOString() });
            const before = (await t.prisma.examSession.findUniqueOrThrow({ where: { id: session.id } })).quizSnapshotHash;
            t.content.editQuestion(quiz.id, quiz.questionIds[0], { question: huge });

            const res = await call(t.server, 'post', `/examsessions/${session.id}/refresh-snapshot`, owner.token);
            expect(res.status).toBe(422);
            expect(res.body.code).toBe('QUIZSET_TOO_LARGE');
            expect((await t.prisma.examSession.findUniqueOrThrow({ where: { id: session.id } })).quizSnapshotHash).toBe(before);
        });

        it('a quiz just under the cap is accepted', async () => {
            const quiz = await seedQuizSet(t, owner.id, [], [{ question: 'x'.repeat(MB - 4096), answer: 'A' }]);
            const roomId = await createRoom(t, owner, quiz.id);
            expect((await createSession(t, owner, roomId)).status).toBe(201);
        });
    });
});
