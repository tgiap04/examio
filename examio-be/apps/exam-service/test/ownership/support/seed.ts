import { rid, type ExamTestApp } from './exam-test-app';

/** Fixtures for the exam family. Every call creates fresh rows with unique ids. */
export async function seedQuizSet(
    t: ExamTestApp,
    ownerId: string,
    over: Record<string, unknown> = {}
) {
    const id = `qs_${rid()}`;
    await t.prisma.quizSet.create({
        data: { id, title: `quiz ${id}`, userId: ownerId, ...over } as never,
    });
    const q = await t.prisma.quizQuestion.create({
        data: {
            id: `qq_${rid()}`,
            question: 'Capital of France?',
            options: ['Paris', 'Rome'],
            answer: 'Paris',
        },
    });
    await t.prisma.detailsQuizQuestion.create({
        data: { quizSetId: id, quizQuestionId: q.id },
    });
    return { id, questionId: q.id };
}

export async function seedExamRoom(t: ExamTestApp, hostId: string) {
    const quiz = await seedQuizSet(t, hostId);
    const id = `er_${rid()}`;
    await t.prisma.examRoom.create({
        data: {
            id,
            title: `room ${id}`,
            description: 'd',
            quizSetId: quiz.id,
            hostId,
        },
    });
    return { id, quizSetId: quiz.id, questionId: quiz.questionId };
}

export interface SessionOptions {
    assessType?: 0 | 1;
    accessCode?: string | null;
    whitelist?: string[];
    allowRetake?: boolean;
    showAnswersAfterSubmit?: boolean;
}

/** An ONGOING session (window around now) of `roomId`. */
export async function seedExamSession(
    t: ExamTestApp,
    roomId: string,
    o: SessionOptions = {}
) {
    const id = `es_${rid()}`;
    const now = Date.now();
    await t.prisma.examSession.create({
        data: {
            id,
            examRoomId: roomId,
            status: 1,
            startTime: new Date(now - 3_600_000),
            endTime: new Date(now + 3_600_000),
            assessType: o.assessType ?? 1,
            accessCode: o.accessCode ?? null,
            whitelist: o.whitelist ?? [],
            allowRetake: o.allowRetake ?? false,
            showAnswersAfterSubmit: o.showAnswersAfterSubmit ?? true,
        },
    });
    return id;
}

export async function seedAttempt(
    t: ExamTestApp,
    sessionId: string,
    userId: string,
    status = 0
) {
    const id = `ea_${rid()}`;
    await t.prisma.examAttempt.create({
        data: {
            id,
            examSessionId: sessionId,
            userId,
            score: 0,
            startedAt: new Date(),
            status,
        },
    });
    return id;
}
