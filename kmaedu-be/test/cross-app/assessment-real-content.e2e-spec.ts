import { bootAssessmentApp, type AssessmentTestApp } from '../../apps/assessment-service/test/ownership/support/assessment-test-app';
import { connectPublisher, eventually } from '../../apps/assessment-service/test/ownership/support/broker';
import { createRoom, createSession, createSessionOk, storedSnapshot } from '../../apps/assessment-service/test/ownership/support/flows';
import { call } from '../../apps/assessment-service/test/ownership/support/http';
import { student as makeStudent, teacher as makeTeacher, type TokenUser } from '../../apps/assessment-service/test/ownership/support/users';
import { serviceDatabaseUrl } from './helpers/real-auth-admin';
import { startRealContent, type RealContent } from './helpers/real-content';

/**
 * assessment against the REAL content-service over real gRPC (the per-service suite uses a fake with the
 * same contract): the snapshot hash is the one content computes, an edit in content is drift, a refresh
 * adopts it, and a deleted quiz set changes nothing a student sees. Also proves content's publish side:
 * the delete leaves a `content.quizset.deleted` row in content's outbox.
 */
describe('assessment over the real content-service (e2e)', () => {
    let t: AssessmentTestApp<RealContent>;
    let owner: TokenUser;
    let learner: TokenUser;

    /** A quiz set written straight into content's database: 2 labels, 4 questions, answers A B C D. */
    async function seedSet(ownerId: string) {
        const id = `qs_${Math.random().toString(36).slice(2, 12)}`;
        const db = t.content.prisma;
        await db.quizSet.create({ data: { id, title: `quiz ${id}`, userId: ownerId } });
        const labels = [] as string[];
        for (const [order, name] of ['Part A', 'Part B'].entries()) {
            const label = await db.quizSetLabel.create({ data: { id: `ql_${id}_${order}`, quizSetId: id, name, order } });
            labels.push(label.id);
        }
        const questionIds: string[] = [];
        for (const [i, answer] of ['A', 'B', 'C', 'D'].entries()) {
            const q = await db.quizQuestion.create({
                data: {
                    id: `qq_${id}_${i}`,
                    question: `Original Q${i + 1}`,
                    options: ['a', 'b', 'c', 'd'],
                    answer,
                    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
                },
            });
            await db.detailsQuizQuestion.create({ data: { quizSetId: id, quizQuestionId: q.id, labelId: labels[i % 2] } });
            questionIds.push(q.id);
        }
        return { id, questionIds };
    }

    beforeAll(async () => {
        process.env.DATABASE_URL = serviceDatabaseUrl('ASSESSMENT');
        const contentUrl = serviceDatabaseUrl('CONTENT');
        const rabbit = process.env.RABBITMQ_URL as string;
        t = await bootAssessmentApp({
            content: (keys) =>
                startRealContent(keys, { databaseUrl: contentUrl, rabbitmqUrl: process.env.CONTENT_RABBITMQ_URL ?? rabbit }),
        });
        owner = await makeTeacher(t);
        learner = await makeStudent(t);
    });
    afterAll(() => t?.close());

    it('snapshot, drift, refresh and immutability across the real service boundary', async () => {
        const quiz = await seedSet(owner.id);
        const roomId = await createRoom(t, owner, quiz.id);
        // content's real GetQuizSetsByIds carries the question count into the teacher's room views
        const detail = await call(t.server, 'get', `/examrooms/detail/${roomId}`, owner.token);
        expect(detail.body.quizSet.questionCount).toBe(4);
        const listed = await call(t.server, 'get', '/examrooms/list?limit=50', owner.token);
        expect(listed.body.examRooms.find((r: { id: string }) => r.id === roomId).quizSet.questionCount).toBe(4);
        const created = await createSessionOk(t, owner, roomId, { startTime: new Date(Date.now() + 3_600_000).toISOString() });
        const snapshot = await storedSnapshot(t, created.id);
        expect(snapshot.questions.map((q) => q.answer)).toEqual(['A', 'B', 'C', 'D']);
        expect(snapshot.labels.map((l) => l.name)).toEqual(['Part A', 'Part B']);
        expect(created.quizSnapshotHash).toBe(snapshot.contentHash);

        const view = () => call(t.server, 'get', `/examsessions/get-by-id/${created.id}`, owner.token);
        expect((await view()).body).toMatchObject({ snapshotOutdated: false, canRefreshSnapshot: true });

        // the owner edits a question in content (its own HTTP API, its own database)
        const edit = await call(t.content.server, 'put', `/quizsets/${quiz.id}/questions/${quiz.questionIds[0]}`, owner.token, {
            question: 'EDITED Q1',
            answer: 'D',
        });
        expect(edit.status).toBe(200);
        expect((await view()).body).toMatchObject({ snapshotOutdated: true, canRefreshSnapshot: true });

        const refreshed = await call(t.server, 'post', `/examsessions/${created.id}/refresh-snapshot`, owner.token);
        expect(refreshed.status).toBe(200);
        expect((await storedSnapshot(t, created.id)).questions[0]).toMatchObject({ question: 'EDITED Q1', answer: 'D' });
        expect((await view()).body.snapshotOutdated).toBe(false);

        // start the exam, then delete the quiz set: the attempt is graded on the stored snapshot
        await t.prisma.examSession.update({ where: { id: created.id }, data: { startTime: new Date(Date.now() - 60_000) } });
        const start = await call(t.server, 'post', '/examattempts/start', learner.token, { examSessionId: created.id });
        expect(start.status).toBeLessThan(300);
        const attemptId = start.body.examAttempt.id as string;
        const ids: string[] = start.body.examAttempt.selectedQuestionIds;

        expect((await call(t.content.server, 'delete', `/quizsets/${quiz.id}`, owner.token)).status).toBe(200);
        const outbox = await t.content.prisma.outboxEvent.findMany({ where: { type: 'content.quizset.deleted' } });
        expect(outbox.some((row) => JSON.stringify(row.envelope).includes(quiz.id))).toBe(true);
        const publisher = await connectPublisher((process.env.RABBITMQ_CONTENT_URL ?? process.env.RABBITMQ_URL) as string);
        try {
            // the relay is a worker process; deliver the row's event as the content broker user
            await publisher.publish('content.quizset.deleted', { quizSetIds: [quiz.id], ownerId: owner.id });
        } finally {
            await publisher.close();
        }
        await eventually(async () => (await t.prisma.examRoom.findUniqueOrThrow({ where: { id: roomId } })).sourceDeleted);

        const stored = await storedSnapshot(t, created.id);
        const answerOf = new Map(stored.questions.map((q) => [q.id, q.answer]));
        await call(t.server, 'put', `/examattempts/${attemptId}/progress`, learner.token, {
            answers: Object.fromEntries(ids.map((id) => [id, answerOf.get(id)])),
        });
        const submit = await call(t.server, 'post', `/examattempts/${attemptId}/submit`, learner.token);
        expect(submit.body).toMatchObject({ correctAnswers: 4, totalQuestions: 4, score: 100 });

        const again = await createSession(t, owner, roomId);
        expect(again.status).toBe(422);
        expect(again.body.code).toBe('QUIZSET_DELETED');
    });

    it("content's contract: only the owner's token reads a snapshot (a service token or a non-owner is refused by content itself)", async () => {
        const quiz = await seedSet(owner.id);
        const other = await makeTeacher(t);
        const roomOfOther = await t.prisma.examRoom.create({
            data: { id: `er_${quiz.id}`, title: 'foreign', quizSetId: quiz.id, quizSetTitle: 't', hostId: other.id },
        });
        const res = await createSession(t, other, roomOfOther.id);
        // content answers NOT_FOUND for a set that is not the caller's: the session cannot be made from it
        expect(res.status).toBe(422);
        expect(res.body.code).toBe('QUIZSET_DELETED');
        expect(await t.prisma.examSession.count({ where: { examRoomId: roomOfOther.id } })).toBe(0);
    });
});
