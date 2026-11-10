import { ContentClient } from '../../src/clients/content.client';
import { bootAssessmentApp, type AssessmentTestApp } from './support/assessment-test-app';
import { createRoom, createSession, createSessionOk } from './support/flows';
import { call } from './support/http';
import { seedQuizSet } from './support/seed';
import { student as makeStudent, teacher as makeTeacher, type TokenUser } from './support/users';

/**
 * content-service goes away (its gRPC server stops). Exam time must not notice; host views degrade
 * (`snapshotOutdated: null`, stored titles); the writes that need content answer 503 and store nothing.
 */
describe('content-service outage (e2e)', () => {
    let t: AssessmentTestApp;
    let owner: TokenUser;
    let learner: TokenUser;
    let late: TokenUser;
    let roomId: string;
    let sessionId: string;
    let contentCalls: jest.SpyInstance[];

    beforeAll(async () => {
        t = await bootAssessmentApp();
        owner = await makeTeacher(t);
        learner = await makeStudent(t);
        late = await makeStudent(t);
        const quiz = await seedQuizSet(t, owner.id, [], [{ question: 'Q1', answer: 'A' }, { question: 'Q2', answer: 'B' }]);
        roomId = await createRoom(t, owner, quiz.id, 'Outage room');
        sessionId = (await createSessionOk(t, owner, roomId)).id;
        // down for good: every later test runs without content
        await t.content.close();
        const client = t.app.get(ContentClient);
        contentCalls = (['getQuizSetSnapshot', 'getQuizSetsByIds', 'getUserContentStats'] as const).map((m) => jest.spyOn(client, m));
    });
    afterAll(() => t?.close());

    it('host get-by-id and the room session list still answer 200 with snapshotOutdated null', async () => {
        const byId = await call(t.server, 'get', `/examsessions/get-by-id/${sessionId}`, owner.token);
        expect(byId.status).toBe(200);
        expect(byId.body.snapshotOutdated).toBeNull();
        expect(byId.body.canRefreshSnapshot).toBe(true);
        const list = await call(t.server, 'get', `/examrooms/${roomId}/sessions`, owner.token);
        expect(list.status).toBe(200);
        expect(list.body.sessions[0].snapshotOutdated).toBeNull();
    });

    it('room reads fall back to the title stored on the room', async () => {
        for (const path of [`/examrooms/detail/${roomId}`, '/examrooms/list', '/examrooms/list-all']) {
            const res = await call(t.server, 'get', path, owner.token);
            expect({ path, status: res.status }).toEqual({ path, status: 200 });
        }
        const detail = await call(t.server, 'get', `/examrooms/detail/${roomId}`, owner.token);
        expect(detail.body.quizSet.title).toMatch(/^quiz /);
    });

    it('creating a room or a session, and refreshing, are 503 CONTENT_UNAVAILABLE and store nothing', async () => {
        const rooms = await t.prisma.examRoom.count({ where: { hostId: owner.id } });
        const room = await call(t.server, 'post', '/examrooms', owner.token, { title: 'x', quizSetId: 'qs_any' });
        expect(room.status).toBe(503);
        expect(room.body.code).toBe('CONTENT_UNAVAILABLE');
        expect(await t.prisma.examRoom.count({ where: { hostId: owner.id } })).toBe(rooms);

        const sessions = await t.prisma.examSession.count({ where: { examRoomId: roomId } });
        const session = await createSession(t, owner, roomId);
        expect(session.status).toBe(503);
        expect(session.body.code).toBe('CONTENT_UNAVAILABLE');
        expect(await t.prisma.examSession.count({ where: { examRoomId: roomId } })).toBe(sessions);

        await t.prisma.examSession.update({ where: { id: sessionId }, data: { status: 0 } });
        const before = (await t.prisma.examSession.findUniqueOrThrow({ where: { id: sessionId } })).quizSnapshotHash;
        const refresh = await call(t.server, 'post', `/examsessions/${sessionId}/refresh-snapshot`, owner.token);
        expect(refresh.status).toBe(503);
        expect((await t.prisma.examSession.findUniqueOrThrow({ where: { id: sessionId } })).quizSnapshotHash).toBe(before);
    });

    it('available-labels: from the session snapshot it works, from a fresh one it is 503', async () => {
        const fromSession = await call(t.server, 'get', `/examsessions/room/${roomId}/available-labels?sessionId=${sessionId}`, owner.token);
        expect(fromSession.status).toBe(200);
        expect(fromSession.body.totalQuestions).toBe(2);
        expect((await call(t.server, 'get', `/examsessions/room/${roomId}/available-labels`, owner.token)).status).toBe(503);
    });

    it('exam time never needs content: start, read, answer and submit all work', async () => {
        contentCalls.forEach((c) => c.mockClear());
        const start = await call(t.server, 'post', '/examattempts/start', learner.token, { examSessionId: sessionId });
        expect(start.status).toBeLessThan(300);
        const attemptId = start.body.examAttempt.id as string;
        for (const path of [`/examattempts/${attemptId}/secure-quiz`, `/examattempts/${attemptId}/quiz`, `/examsessions/study/${sessionId}`, `/examsessions/study/${sessionId}/stats`]) {
            const res = await call(t.server, 'get', path, learner.token);
            expect({ path, status: res.status }).toEqual({ path, status: 200 });
        }
        const submit = await call(t.server, 'post', `/examattempts/${attemptId}/submit`, learner.token);
        expect(submit.status).toBeLessThan(300);
        expect(submit.body.totalQuestions).toBe(2);
        // a second student on a cold path (their own attempt) is served too
        const other = await call(t.server, 'post', '/examattempts/start', late.token, { examSessionId: sessionId });
        expect(other.status).toBeLessThan(300);
        for (const c of contentCalls) expect(c).not.toHaveBeenCalled();
    });

    it('history-stats: 200 with null for what content owns, and the degraded result is not cached', async () => {
        const first = await call(t.server, 'get', '/examattempts/history-stats', learner.token);
        expect(first.status).toBe(200);
        expect(first.body).toMatchObject({ examsCreated: null, flashcardSets: null });
        expect(typeof first.body.totalPDFs).toBe('number');
        contentCalls.forEach((c) => c.mockClear());
        const second = await call(t.server, 'get', '/examattempts/history-stats', learner.token);
        expect(second.body).toMatchObject({ examsCreated: null });
        expect(contentCalls[2]).toHaveBeenCalledTimes(1); // asked again: nothing incomplete was cached
    });
});
