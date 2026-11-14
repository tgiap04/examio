import { ContentClient } from '../../src/clients/content.client';
import { bootAssessmentApp, type AssessmentTestApp } from './support/assessment-test-app';
import { createRoom, createSessionOk, editQuestion, storedSnapshot } from './support/flows';
import { call } from './support/http';
import { seedQuizSet } from './support/seed';
import { admin as makeAdmin, student as makeStudent, teacher as makeTeacher, type TokenUser } from './support/users';

/** Drift detection on the host views and the guarded refresh of the snapshot. A content backend over real gRPC. */
describe('snapshot drift and refresh (e2e)', () => {
    let t: AssessmentTestApp;
    let owner: TokenUser;
    let other: TokenUser;
    let learner: TokenUser;
    let getQuizSetsByIds: jest.SpyInstance;

    const get = (path: string, who: TokenUser = owner) => call(t.server, 'get', path, who.token);
    const refresh = (id: string, who: TokenUser = owner) => call(t.server, 'post', `/examsessions/${id}/refresh-snapshot`, who.token);
    const hashOf = async (id: string) => (await t.prisma.examSession.findUniqueOrThrow({ where: { id } })).quizSnapshotHash;

    /** A fresh quiz set + room + session (UPCOMING status, 0 attempts). */
    async function fresh() {
        const quiz = await seedQuizSet(t, owner.id, [], [
            { question: 'Q1', answer: 'A' },
            { question: 'Q2', answer: 'B' },
        ]);
        const roomId = await createRoom(t, owner, quiz.id);
        const session = await createSessionOk(t, owner, roomId, { startTime: new Date(Date.now() + 3_600_000).toISOString() });
        return { quiz, roomId, sessionId: session.id };
    }

    beforeAll(async () => {
        t = await bootAssessmentApp();
        owner = await makeTeacher(t);
        other = await makeTeacher(t);
        learner = await makeStudent(t);
        getQuizSetsByIds = jest.spyOn(t.app.get(ContentClient), 'getQuizSetsByIds');
    });
    afterAll(() => t?.close());

    it('host get-by-id: unchanged -> snapshotOutdated false + canRefreshSnapshot true; after an edit in content -> true', async () => {
        const { quiz, sessionId } = await fresh();
        const before = await get(`/examsessions/get-by-id/${sessionId}`);
        expect(before.status).toBe(200);
        expect(before.body).toMatchObject({ snapshotOutdated: false, canRefreshSnapshot: true });

        editQuestion(t, quiz.id, quiz.questionIds[0], { question: 'Q1 edited' });
        const after = await get(`/examsessions/get-by-id/${sessionId}`);
        expect(after.body).toMatchObject({ snapshotOutdated: true, canRefreshSnapshot: true });
    });

    it('a title-only change is not drift (the hash covers what an exam shows, not the title)', async () => {
        const { quiz, sessionId } = await fresh();
        t.content.rename(quiz.id, 'renamed');
        expect((await get(`/examsessions/get-by-id/${sessionId}`)).body.snapshotOutdated).toBe(false);
    });

    it('refresh: new hash, snapshot replaced, the next get-by-id says false (and the cached view is dropped)', async () => {
        const { quiz, sessionId } = await fresh();
        const oldHash = await hashOf(sessionId);
        expect((await get(`/examsessions/get-by-id/${sessionId}`)).body.quizSnapshotHash).toBe(oldHash); // primes the cache
        editQuestion(t, quiz.id, quiz.questionIds[1], { question: 'Q2 edited', answer: 'C' });

        const res = await refresh(sessionId);
        expect(res.status).toBe(200);
        expect(res.body.quizSnapshotHash).toMatch(/^[0-9a-f]{64}$/);
        expect(res.body.quizSnapshotHash).not.toBe(oldHash);
        expect(await hashOf(sessionId)).toBe(res.body.quizSnapshotHash);
        const snapshot = await storedSnapshot(t, sessionId);
        expect(snapshot.questions.find((q) => q.id === quiz.questionIds[1])).toMatchObject({ question: 'Q2 edited', answer: 'C' });

        const view = await get(`/examsessions/get-by-id/${sessionId}`);
        expect(view.body).toMatchObject({ snapshotOutdated: false, quizSnapshotHash: res.body.quizSnapshotHash });
    });

    it('PUT :id with any body never touches the snapshot or its hash', async () => {
        const { quiz, sessionId } = await fresh();
        const oldHash = await hashOf(sessionId);
        editQuestion(t, quiz.id, quiz.questionIds[0], { question: 'changed after creation' });
        for (const body of [{}, { maxAttempts: 3 }, { quizSnapshotHash: 'x'.repeat(64), quizSnapshot: { v: 1 } }]) {
            const res = await call(t.server, 'put', `/examsessions/${sessionId}`, owner.token, body);
            expect([200, 400]).toContain(res.status);
            expect(await hashOf(sessionId)).toBe(oldHash);
        }
        expect((await storedSnapshot(t, sessionId)).questions[0].question).toBe('Q1');
    });

    it('after the first attempt refresh is 409 SNAPSHOT_LOCKED and the hash is unchanged', async () => {
        const { quiz, sessionId } = await fresh();
        await t.prisma.examSession.update({ where: { id: sessionId }, data: { startTime: new Date(Date.now() - 60_000) } });
        const start = await call(t.server, 'post', '/examattempts/start', learner.token, { examSessionId: sessionId });
        expect(start.status).toBeLessThan(300);
        const oldHash = await hashOf(sessionId);
        editQuestion(t, quiz.id, quiz.questionIds[0], { question: 'late edit' });

        const res = await refresh(sessionId);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('SNAPSHOT_LOCKED');
        expect(await hashOf(sessionId)).toBe(oldHash);
        expect((await get(`/examsessions/get-by-id/${sessionId}`)).body).toMatchObject({ snapshotOutdated: true, canRefreshSnapshot: false });
    });

    it('an ONGOING (status 1) or ENDED session is locked even without attempts', async () => {
        for (const status of [1, 2]) {
            const { sessionId } = await fresh();
            await t.prisma.examSession.update({ where: { id: sessionId }, data: { status } });
            const res = await refresh(sessionId);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('SNAPSHOT_LOCKED');
            expect((await get(`/examsessions/get-by-id/${sessionId}`)).body.canRefreshSnapshot).toBe(false);
        }
    });

    it('a refresh that would leave the stored selection undrawable is refused and changes nothing', async () => {
        const { quiz, sessionId } = await fresh();
        await call(t.server, 'put', `/examsessions/${sessionId}`, owner.token, { questionSelectionMode: 1, questionCount: 2 });
        t.content.removeQuestion(quiz.id, quiz.questionIds[0]);
        const oldHash = await hashOf(sessionId);
        const res = await refresh(sessionId);
        expect(res.status).toBe(400);
        expect(await hashOf(sessionId)).toBe(oldHash);
    });

    it('the room session list answers drift for every session with ONE content call', async () => {
        const { quiz, roomId, sessionId } = await fresh();
        const second = (await createSessionOk(t, owner, roomId, { startTime: new Date(Date.now() + 7_200_000).toISOString() })).id;
        editQuestion(t, quiz.id, quiz.questionIds[0], { question: 'drifted' });
        await refresh(second); // second now matches the content again

        getQuizSetsByIds.mockClear();
        const res = await get(`/examrooms/${roomId}/sessions`);
        expect(res.status).toBe(200);
        const byId = new Map<string, { snapshotOutdated: boolean; canRefreshSnapshot: boolean }>(
            res.body.sessions.map((s: { id: string; snapshotOutdated: boolean; canRefreshSnapshot: boolean }) => [s.id, s])
        );
        expect(byId.get(sessionId)).toMatchObject({ snapshotOutdated: true, canRefreshSnapshot: true });
        expect(byId.get(second)).toMatchObject({ snapshotOutdated: false, canRefreshSnapshot: true });
        const driftCalls = getQuizSetsByIds.mock.calls.filter((c) => c[2] === true);
        expect(driftCalls).toHaveLength(1);
        expect(driftCalls[0][0]).toEqual([quiz.id]);
    });

    it('get-by-id asks content once (with the hash) and never lists the snapshot column', async () => {
        const { quiz, sessionId } = await fresh();
        getQuizSetsByIds.mockClear();
        const res = await get(`/examsessions/get-by-id/${sessionId}`);
        expect(getQuizSetsByIds).toHaveBeenCalledTimes(1);
        expect(getQuizSetsByIds.mock.calls[0].slice(0, 1)).toEqual([[quiz.id]]);
        expect(getQuizSetsByIds.mock.calls[0][2]).toBe(true);
        expect(res.body).not.toHaveProperty('quizSnapshot');
    });

    describe('who may refresh', () => {
        it('another TEACHER 404, STUDENT 403, ADMIN-only 403, anonymous 401', async () => {
            const { sessionId } = await fresh();
            const adminOnly = await makeAdmin(t);
            expect((await refresh(sessionId, other)).status).toBe(404);
            expect((await refresh(sessionId, learner)).status).toBe(403);
            expect([403, 404]).toContain((await refresh(sessionId, adminOnly)).status);
            expect((await call(t.server, 'post', `/examsessions/${sessionId}/refresh-snapshot`)).status).toBe(401);
        });
    });

    describe('the row lock: refresh and attempt start never interleave', () => {
        /**
         * Holds `FOR KEY SHARE` on the session row until `release()`. That mode conflicts with nothing but
         * `FOR UPDATE`, so a plain UPDATE of the snapshot or the INSERT of an attempt (a foreign-key check)
         * would sail through: only code that takes `FOR UPDATE` on the row waits.
         */
        async function holdLock(sessionId: string) {
            let release!: () => void;
            const gate = new Promise<void>((resolve) => (release = resolve));
            let locked!: () => void;
            const ready = new Promise<void>((resolve) => (locked = resolve));
            const tx = t.prisma.$transaction(
                async (db) => {
                    await db.$queryRaw`SELECT "id" FROM "ExamSession" WHERE "id" = ${sessionId} FOR KEY SHARE`;
                    locked();
                    await gate;
                },
                { timeout: 20_000 }
            );
            await ready;
            return { release, done: tx };
        }
        const settled = async (p: Promise<unknown>, ms = 600) =>
            Promise.race([p.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))]);

        it('refresh and attempt start both take the row lock: they wait behind a conflicting lock, then proceed', async () => {
            const { quiz, sessionId } = await fresh();
            await t.prisma.examSession.update({ where: { id: sessionId }, data: { startTime: new Date(Date.now() - 60_000) } });
            editQuestion(t, quiz.id, quiz.questionIds[0], { question: 'changed' });

            const lock = await holdLock(sessionId);
            const refreshing = refresh(sessionId).then((r) => r.status);
            const starting = call(t.server, 'post', '/examattempts/start', learner.token, { examSessionId: sessionId }).then((r) => r.status);
            expect(await settled(refreshing)).toBe(false);
            expect(await settled(starting)).toBe(false);
            lock.release();
            await lock.done;
            const [r, s] = await Promise.all([refreshing, starting]);
            // whoever got the row first wins: the start always succeeds, the refresh either went first or lost with 409
            expect(s).toBeLessThan(300);
            expect([200, 409]).toContain(r);
        });

        it('never a started attempt next to a changed snapshot: the attempt draws from the snapshot that is stored', async () => {
            for (let round = 0; round < 6; round++) {
                const { quiz, sessionId } = await fresh();
                await t.prisma.examSession.update({ where: { id: sessionId }, data: { startTime: new Date(Date.now() - 60_000) } });
                const before = await storedSnapshot(t, sessionId);
                // new content with a NEW question id, so the old and the new snapshot are told apart
                t.content.removeQuestion(quiz.id, quiz.questionIds[0]);
                t.content.addQuestion(quiz.id, { question: 'brand new', options: ['x', 'y'], answer: 'A' });

                const learnerN = await makeStudent(t);
                const [r, s] = await Promise.all([
                    refresh(sessionId),
                    call(t.server, 'post', '/examattempts/start', learnerN.token, { examSessionId: sessionId }),
                ]);
                const after = await storedSnapshot(t, sessionId);
                const attempt = await t.prisma.examAttempt.findFirst({ where: { examSessionId: sessionId } });
                expect(s.status).toBeLessThan(300);
                const drawn = new Set(attempt?.selectedQuestionIds);
                const known = new Set(after.questions.map((q) => q.id));
                for (const id of drawn) expect(known.has(id)).toBe(true);
                if (r.status === 200) {
                    expect(after.contentHash).not.toBe(before.contentHash);
                } else {
                    expect(r.status).toBe(409);
                    expect(after.contentHash).toBe(before.contentHash);
                }
            }
        });
    });
});
