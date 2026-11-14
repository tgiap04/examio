import { bootAssessmentApp, type AssessmentTestApp } from './support/assessment-test-app';
import { createRoom, createSession, createSessionOk } from './support/flows';
import { call } from './support/http';
import { seedQuizSet } from './support/seed';
import { secretKeysIn, student as makeStudent, teacher as makeTeacher, type TokenUser } from './support/users';
import { RedisService } from '@kmaedu/redis';
import { ContentClient } from '../../src/clients/content.client';

/** Rooms name a content quiz set (no FK): create validates it, lists show fresh titles, students see the stored one. */
describe('exam rooms over content quiz sets (e2e)', () => {
    let t: AssessmentTestApp;
    let owner: TokenUser;
    let other: TokenUser;
    let learner: TokenUser;

    beforeAll(async () => {
        t = await bootAssessmentApp();
        owner = await makeTeacher(t);
        other = await makeTeacher(t);
        learner = await makeStudent(t);
    });
    afterAll(() => t?.close());

    it('create: the owner\'s set -> 201 with the set title; a missing or foreign set -> 404 (indistinguishable); nothing is stored', async () => {
        const three = { question: 'Q?', options: ['a', 'b'], answer: 'A' };
        const mine = await seedQuizSet(t, owner.id, [], [three, three, three]);
        t.content.rename(mine.id, 'My algebra');
        const ok = await call(t.server, 'post', '/examrooms', owner.token, { title: 'R1', quizSetId: mine.id });
        expect(ok.status).toBe(201);
        expect(ok.body.examRoom.quizSet).toEqual({
            id: mine.id,
            title: 'My algebra',
            description: null,
            thumbnail: null,
            questionCount: 3,
        });
        expect((await t.prisma.examRoom.findUniqueOrThrow({ where: { id: ok.body.examRoom.id } })).quizSetTitle).toBe('My algebra');

        const foreign = await seedQuizSet(t, other.id);
        const before = await t.prisma.examRoom.count({ where: { hostId: owner.id } });
        for (const quizSetId of [foreign.id, 'qs_does_not_exist']) {
            const res = await call(t.server, 'post', '/examrooms', owner.token, { title: 'R2', quizSetId });
            expect(res.status).toBe(404);
        }
        expect(await t.prisma.examRoom.count({ where: { hostId: owner.id } })).toBe(before);
    });

    it('list / list-all / detail: the title is the fresh one from content (one batch call, then cached), the stored one is the fallback', async () => {
        const a = await seedQuizSet(t, owner.id);
        const b = await seedQuizSet(t, owner.id);
        const roomA = await createRoom(t, owner, a.id, 'Room A');
        await createRoom(t, owner, b.id, 'Room B');
        t.content.rename(a.id, 'Renamed in content');
        const redis = t.app.get(RedisService);
        // the create responses cached both titles for 5 minutes: expire A's (a rename shows after the TTL)
        expect(await redis.get(`assessment:cache:quizset:${a.id}`)).toEqual({ title: `quiz ${a.id}`, questionCount: 1 });
        await redis.del(`assessment:cache:quizset:${a.id}`);
        const spy = jest.spyOn(t.app.get(ContentClient), 'getQuizSetsByIds');
        try {
            // detail of one room: A's cache entry is gone, so content is asked and the fresh title shows
            const detail = await call(t.server, 'get', `/examrooms/detail/${roomA}`, owner.token);
            expect(detail.body.quizSet.title).toBe('Renamed in content');
            expect(detail.body.quizSet.questionCount).toBe(1);

            spy.mockClear();
            const list = await call(t.server, 'get', '/examrooms/list?limit=50', owner.token);
            expect(list.status).toBe(200);
            const titleOf = (id: string) =>
                list.body.examRooms.find((r: { quizSetId: string }) => r.quizSetId === id).quizSet.title;
            expect(titleOf(a.id)).toBe('Renamed in content');
            const countOf = (id: string) =>
                list.body.examRooms.find((r: { quizSetId: string }) => r.quizSetId === id).quizSet.questionCount;
            expect([countOf(a.id), countOf(b.id)]).toEqual([1, 1]);
            // ids the cache lacks go in at most ONE call per page
            expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
            const all = await call(t.server, 'get', '/examrooms/list-all', owner.token);
            expect(all.status).toBe(200);
            expect(all.body.examRooms.length).toBeGreaterThanOrEqual(2);
            const allCount = (id: string) =>
                all.body.examRooms.find((r: { quizSetId: string }) => r.quizSetId === id).quizSet.questionCount;
            expect([allCount(a.id), allCount(b.id)]).toEqual([1, 1]);
            spy.mockClear();
            await call(t.server, 'get', '/examrooms/list?limit=50', owner.token);
            expect(spy).not.toHaveBeenCalled(); // all titles cached for 5 minutes now
        } finally {
            spy.mockRestore();
        }
    });

    it('student-facing views show the stored title and never call content', async () => {
        const quiz = await seedQuizSet(t, owner.id);
        t.content.rename(quiz.id, 'Stored title');
        const roomId = await createRoom(t, owner, quiz.id);
        const session = await createSessionOk(t, owner, roomId);
        t.content.rename(quiz.id, 'Newer title in content');

        const spies = (['getQuizSetSnapshot', 'getQuizSetsByIds', 'getUserContentStats'] as const).map((m) =>
            jest.spyOn(t.app.get(ContentClient), m)
        );
        try {
            const start = await call(t.server, 'post', '/examattempts/start', learner.token, { examSessionId: session.id });
            const attemptId = start.body.examAttempt.id as string;
            const reads = await Promise.all([
                call(t.server, 'get', `/examsessions/study/${session.id}`, learner.token),
                call(t.server, 'get', `/examsessions/study/${session.id}/stats`, learner.token),
                call(t.server, 'get', `/examsessions/get-public/${session.id}`),
                call(t.server, 'get', `/examattempts/get-by-id/${attemptId}`, learner.token),
                call(t.server, 'get', `/examattempts/${attemptId}/secure-quiz`, learner.token),
                call(t.server, 'get', '/examattempts/list', learner.token),
                call(t.server, 'get', '/student/recent-exams', learner.token),
            ]);
            // writes in order: progress, then the grade
            reads.push(await call(t.server, 'put', `/examattempts/${attemptId}/progress`, learner.token, { currentIndex: 0 }));
            reads.push(await call(t.server, 'post', `/examattempts/${attemptId}/submit`, learner.token));
            for (const r of reads) expect(r.status).toBeLessThan(300);
            expect(reads[0].body.examRoom.quizSet.title).toBe('Stored title');
            expect(reads[3].body.examSession.examRoom.quizSet.title).toBe('Stored title');
            // the question count is a teacher-view field: students never get it
            expect(reads[0].body.examRoom.quizSet).not.toHaveProperty('questionCount');
            expect(reads[3].body.examSession.examRoom.quizSet).not.toHaveProperty('questionCount');
            for (const s of spies) expect(s).not.toHaveBeenCalled();
            expect(secretKeysIn(reads.slice(0, 3).map((r) => r.body))).toEqual([]);
        } finally {
            spies.forEach((s) => s.mockRestore());
        }
    });

    it('a room flagged sourceDeleted refuses a new session with 422 QUIZSET_DELETED before content is asked', async () => {
        const quiz = await seedQuizSet(t, owner.id);
        const roomId = await createRoom(t, owner, quiz.id);
        await t.prisma.examRoom.update({ where: { id: roomId }, data: { sourceDeleted: true } });
        const spy = jest.spyOn(t.app.get(ContentClient), 'getQuizSetSnapshot');
        try {
            const res = await createSession(t, owner, roomId);
            expect(res.status).toBe(422);
            expect(res.body.code).toBe('QUIZSET_DELETED');
            expect(spy).not.toHaveBeenCalled();
            expect(await t.prisma.examSession.count({ where: { examRoomId: roomId } })).toBe(0);
        } finally {
            spy.mockRestore();
        }
    });

    it('update re-points the room to another owned set (title stored, flag cleared); a foreign set is 404', async () => {
        const first = await seedQuizSet(t, owner.id);
        const second = await seedQuizSet(t, owner.id);
        t.content.rename(second.id, 'Second set');
        const roomId = await createRoom(t, owner, first.id);
        await t.prisma.examRoom.update({ where: { id: roomId }, data: { sourceDeleted: true } });
        const foreign = await seedQuizSet(t, other.id);

        expect((await call(t.server, 'put', `/examrooms/${roomId}`, owner.token, { quizSetId: foreign.id })).status).toBe(404);
        const ok = await call(t.server, 'put', `/examrooms/${roomId}`, owner.token, { quizSetId: second.id });
        expect(ok.status).toBe(200);
        expect(ok.body.examRoom).toMatchObject({ quizSetId: second.id, sourceDeleted: false });
        expect(ok.body.examRoom.quizSet.title).toBe('Second set');
    });
});
