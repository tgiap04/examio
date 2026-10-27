/**
 * Whitelist-based view of an attempt for the examinee and the host. Fields are
 * picked by name (never `...entity`): the session's `accessCode` / `whitelist`
 * (sharing secrets, read through the sharing endpoints only), host emails and
 * audit columns can not leak when the query or schema grows.
 * The answer key is included only for the host, or for the examinee once the
 * attempt is COMPLETED AND the session allows it (`showAnswersAfterSubmit`).
 */
type Instant = Date | string;

/** One question of the attempt's snapshot (the answer key is kept only when the viewer may see it). */
interface QuestionRow {
    id: string;
    question: string;
    options: string[];
    answer: string;
    labelId: string | null;
}

interface SessionRow {
    id: string;
    examRoomId: string;
    status: number;
    startTime: Instant;
    endTime: Instant | null;
    timeLimitMinutes: number | null;
    autoJoinByLink: boolean;
    assessType: number;
    allowRetake: boolean;
    maxAttempts: number;
    showAnswersAfterSubmit: boolean;
    passingScore: number;
    questionCount: number | null;
    questionSelectionMode: number;
    labelQuestionConfig: unknown;
    shuffleQuestions: boolean;
    createdAt: Instant;
    updatedAt: Instant;
    examRoom?: {
        id: string;
        title: string;
        description: string | null;
        quizSetId: string;
        quizSetTitle: string;
    } | null;
}

export interface AttemptRow {
    id: string;
    examSessionId: string;
    userId: string;
    score: number;
    violationCount: number;
    startedAt: Instant;
    finishedAt: Instant | null;
    status: number;
    answers: unknown;
    currentIndex: number;
    markedQuestions: string[];
    totalQuestions: number;
    correctAnswers: number;
    selectedQuestionIds: string[];
    createdAt: Instant;
    updatedAt: Instant;
    examSession?: SessionRow | null;
    user?: { id: string; name: string | null } | null;
}

const COMPLETED = 1;

export function canSeeAnswers(
    relation: 'examinee' | 'host',
    status: number,
    showAnswersAfterSubmit: boolean
): boolean {
    return (
        relation === 'host' ||
        (status === COMPLETED && showAnswersAfterSubmit === true)
    );
}

function pickSession(s: SessionRow, withAnswers: boolean, questions?: QuestionRow[]) {
    const room = s.examRoom;
    return {
        id: s.id,
        examRoomId: s.examRoomId,
        status: s.status,
        startTime: s.startTime,
        endTime: s.endTime,
        timeLimitMinutes: s.timeLimitMinutes,
        autoJoinByLink: s.autoJoinByLink,
        assessType: s.assessType,
        allowRetake: s.allowRetake,
        maxAttempts: s.maxAttempts,
        showAnswersAfterSubmit: s.showAnswersAfterSubmit,
        passingScore: s.passingScore,
        questionCount: s.questionCount,
        questionSelectionMode: s.questionSelectionMode,
        labelQuestionConfig: s.labelQuestionConfig,
        shuffleQuestions: s.shuffleQuestions,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        ...(room && {
            examRoom: {
                id: room.id,
                title: room.title,
                description: room.description,
                // The set's own description and thumbnail belong to content-service: they stay null here.
                quizSet: {
                    id: room.quizSetId,
                    title: room.quizSetTitle,
                    description: null,
                    thumbnail: null,
                    // Same shape as when the questions were a relation, now cut from the session's snapshot.
                    ...(questions && {
                        detailsQuizQuestions: questions.map((q) => ({
                            id: q.id,
                            labelId: q.labelId,
                            quizQuestion: {
                                id: q.id,
                                question: q.question,
                                options: q.options,
                                ...(withAnswers && { answer: q.answer }),
                            },
                        })),
                    }),
                },
            },
        }),
    };
}

/** `questions`: the attempt's questions (from its snapshot), embedded as `examSession.examRoom.quizSet.detailsQuizQuestions`. */
export function toAttemptView(a: AttemptRow, relation: 'examinee' | 'host', questions?: QuestionRow[]) {
    const withAnswers = canSeeAnswers(
        relation,
        a.status,
        a.examSession?.showAnswersAfterSubmit ?? false
    );
    return {
        id: a.id,
        examSessionId: a.examSessionId,
        userId: a.userId,
        score: a.score,
        violationCount: a.violationCount,
        startedAt: a.startedAt,
        finishedAt: a.finishedAt,
        status: a.status,
        answers: a.answers,
        currentIndex: a.currentIndex,
        markedQuestions: a.markedQuestions,
        totalQuestions: a.totalQuestions,
        correctAnswers: a.correctAnswers,
        selectedQuestionIds: a.selectedQuestionIds,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        ...(a.examSession && {
            examSession: pickSession(a.examSession, withAnswers, questions),
        }),
        ...(a.user && {
            user: { id: a.user.id, name: a.user.name },
        }),
    };
}
