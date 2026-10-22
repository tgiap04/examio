/**
 * Whitelist-based view of an attempt for the examinee and the host. Fields are
 * picked by name (never `...entity`): the session's `accessCode` / `whitelist`
 * (sharing secrets, read through the sharing endpoints only), host emails and
 * audit columns can not leak when the query or schema grows.
 * The answer key is included only for the host, or for the examinee once the
 * attempt is COMPLETED AND the session allows it (`showAnswersAfterSubmit`).
 */
type Instant = Date | string;

interface QuestionRow {
    id: string;
    question: string;
    options: string[];
    answer?: string;
}

interface DetailRow {
    id: string;
    labelId?: string | null;
    quizQuestion?: QuestionRow | null;
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
        quizSet?: {
            id: string;
            title: string;
            description: string | null;
            thumbnail: string | null;
            detailsQuizQuestions?: DetailRow[];
        } | null;
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

function pickSession(s: SessionRow, withAnswers: boolean, selected: string[]) {
    const room = s.examRoom;
    const quizSet = room?.quizSet;
    let details = quizSet?.detailsQuizQuestions;
    if (details && selected.length > 0) {
        const byId = new Map(details.map((d) => [d.id, d]));
        details = selected
            .map((id) => byId.get(id))
            .filter((d): d is DetailRow => d !== undefined);
    }
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
                ...(quizSet && {
                    quizSet: {
                        id: quizSet.id,
                        title: quizSet.title,
                        description: quizSet.description,
                        thumbnail: quizSet.thumbnail,
                        ...(details && {
                            detailsQuizQuestions: details.map((d) => ({
                                id: d.id,
                                labelId: d.labelId ?? null,
                                quizQuestion: d.quizQuestion && {
                                    id: d.quizQuestion.id,
                                    question: d.quizQuestion.question,
                                    options: d.quizQuestion.options,
                                    ...(withAnswers && {
                                        answer: d.quizQuestion.answer,
                                    }),
                                },
                            })),
                        }),
                    },
                }),
            },
        }),
    };
}

export function toAttemptView(a: AttemptRow, relation: 'examinee' | 'host') {
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
            examSession: pickSession(
                a.examSession,
                withAnswers,
                a.selectedQuestionIds ?? []
            ),
        }),
        ...(a.user && {
            user: { id: a.user.id, name: a.user.name },
        }),
    };
}
