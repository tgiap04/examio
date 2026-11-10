import { bootAssessmentApp, type AssessmentTestApp } from './support/assessment-test-app';
import { connectPublisher, eventually } from './support/broker';
import { createRoom, createSession, createSessionOk, deleteQuizSet, editQuestion, storedSnapshot } from './support/flows';
import { call } from './support/http';
import { seedQuizSet } from './support/seed';
import { secretKeysIn, student as makeStudent, teacher as makeTeacher, type TokenUser } from './support/users';

/**
 * A session is a frozen copy of the quiz: once it exists, editing or deleting the quiz set in content
 * changes nothing a student sees or is graded on. A content backend over real gRPC next to the real assessment app.
 */
describe('quiz snapshot immutability (e2e)', () => {
    let t: AssessmentTestApp;
    let owner: TokenUser;
    let learner: TokenUser;
    let quiz: Awaited<ReturnType<typeof seedQuizSet>>;
    let roomId: string;
    let sessionId: string;

    beforeAll(async () => {
        t = await bootAssessmentApp();
        owner = await makeTeacher(t);
        learner = await makeStudent(t);
        // answers A, A, B, A, C
        quiz = await seedQuizSet(
            t,
            owner.id,
            ['Part A', 'Part B'],
            [
                { question: 'Original Q1', label: 'Part A', answer: 'A' },
                { question: 'Original Q2', label: 'Part A', answer: 'A' },
                { question: 'Original Q3', label: 'Part B', answer: 'B' },
                { question: 'Original Q4', answer: 'A' },
                { question: 'Original Q5', label: 'Part B', answer: 'C' },
            ]
        );
        roomId = await createRoom(t, owner, quiz.id, 'Algebra room');
        sessionId = (await createSessionOk(t, owner, roomId)).id;
    });
    afterAll(() => t?.close());

    it('the session stores the snapshot taken at creation: 2 labels, 5 questions, answers included, hash of the content', async () => {
        const snapshot = await storedSnapshot(t, sessionId);
        expect(snapshot).toMatchObject({ v: 1, quizSetId: quiz.id });
        expect(snapshot.labels.map((l) => l.name)).toEqual(['Part A', 'Part B']);
        expect(snapshot.questions.map((q) => q.question)).toEqual([
            'Original Q1', 'Original Q2', 'Original Q3', 'Original Q4', 'Original Q5',
        ]);
        expect(snapshot.questions.map((q) => q.answer)).toEqual(['A', 'A', 'B', 'A', 'C']);
        const row = await t.prisma.examSession.findUniqueOrThrow({ where: { id: sessionId } });
        expect(row.quizSnapshotHash).toBe(snapshot.contentHash);
        // the column is omitted from every ordinary read
        expect(row).not.toHaveProperty('quizSnapshot');
    });

    describe('the teacher edits a question and then deletes the quiz set in content', () => {
        beforeAll(async () => {
            editQuestion(t, quiz.id, quiz.questionIds[0], { question: 'EDITED Q1', answer: 'D' });
            deleteQuizSet(t, quiz.id);
            // content's delete publishes this through its outbox relay (a worker process); play it here.
            const content = await connectPublisher(process.env.RABBITMQ_CONTENT_URL as string);
            try {
                await content.publish('content.quizset.deleted', { quizSetIds: [quiz.id], ownerId: owner.id });
            } finally {
                await content.close();
            }
            await eventually(async () => (await t.prisma.examRoom.findUniqueOrThrow({ where: { id: roomId } })).sourceDeleted);
        });

        it('the student still starts the exam on the ORIGINAL questions, answer-free', async () => {
            const start = await call(t.server, 'post', '/examattempts/start', learner.token, { examSessionId: sessionId });
            expect(start.status).toBeLessThan(300);
            const attemptId = start.body.examAttempt.id as string;
            expect(start.body.examAttempt.totalQuestions).toBe(5);

            const quizView = await call(t.server, 'get', `/examattempts/${attemptId}/secure-quiz`, learner.token);
            expect(quizView.status).toBe(200);
            expect(quizView.body.questions.map((q: { question: string }) => q.question)).toEqual([
                'Original Q1', 'Original Q2', 'Original Q3', 'Original Q4', 'Original Q5',
            ]);
            expect(secretKeysIn(quizView.body)).toEqual([]);
            const plain = await call(t.server, 'get', `/examattempts/${attemptId}/quiz`, learner.token);
            expect(plain.status).toBe(200);
            expect(plain.body.questions.map((q: { question: string }) => q.question)[0]).toBe('Original Q1');
            expect(secretKeysIn(plain.body)).toEqual([]);
        });

        it('submitting the original answers is graded 100%: the edited key (D) and the deletion do not count', async () => {
            const start = await call(t.server, 'post', '/examattempts/start', learner.token, { examSessionId: sessionId });
            const attemptId = start.body.examAttempt.id as string;
            const ids: string[] = start.body.examAttempt.selectedQuestionIds;
            const original = await storedSnapshot(t, sessionId);
            const byId = new Map(original.questions.map((q) => [q.id, q.answer]));
            const progress = await call(t.server, 'put', `/examattempts/${attemptId}/progress`, learner.token, {
                answers: Object.fromEntries(ids.map((id) => [id, byId.get(id)])),
            });
            expect(progress.status).toBe(200);

            const submit = await call(t.server, 'post', `/examattempts/${attemptId}/submit`, learner.token);
            expect(submit.status).toBeLessThan(300);
            expect(submit.body).toMatchObject({ correctAnswers: 5, totalQuestions: 5, score: 100 });
            expect(submit.body.questions.map((q: { answer: string }) => q.answer).sort()).toEqual(['A', 'A', 'A', 'B', 'C']);
        });

        it('the room shows sourceDeleted, and a NEW session on it is 422 QUIZSET_DELETED (the old session is untouched)', async () => {
            const room = await call(t.server, 'get', `/examrooms/detail/${roomId}`, owner.token);
            expect(room.status).toBe(200);
            expect(room.body.sourceDeleted).toBe(true);
            // the stored title keeps the room readable
            expect(room.body.quizSet.title).toBe(`quiz ${quiz.id}`);

            const again = await createSession(t, owner, roomId);
            expect(again.status).toBe(422);
            expect(again.body.code).toBe('QUIZSET_DELETED');

            const old = await call(t.server, 'get', `/examsessions/get-by-id/${sessionId}`, owner.token);
            expect(old.status).toBe(200);
            expect(old.body.canRefreshSnapshot).toBe(false);
            expect(old.body.snapshotOutdated).toBe(false);
        });

        it('refresh on a session whose set is gone is 422 QUIZSET_DELETED and changes nothing', async () => {
            const before = (await t.prisma.examSession.findUniqueOrThrow({ where: { id: sessionId } })).quizSnapshotHash;
            const res = await call(t.server, 'post', `/examsessions/${sessionId}/refresh-snapshot`, owner.token);
            expect(res.status).toBe(422);
            expect(res.body.code).toBe('QUIZSET_DELETED');
            expect((await t.prisma.examSession.findUniqueOrThrow({ where: { id: sessionId } })).quizSnapshotHash).toBe(before);
        });
    });
});
