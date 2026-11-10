import type { QuestionResult } from './quiz-practice-scoring';

/**
 * Whitelist-based output for the practice flow. Fields are picked by name
 * (never `...row`), so a new column can not leak an answer key or another
 * user's id. Before submit nothing here carries a correct-answer field.
 */
export interface PracticeQuestionRow {
    id: string;
    question: string;
    options: string[];
}

export interface AttemptRow {
    id: string;
    quizSetId: string;
    type: number;
    answers: unknown;
    currentIndex: number;
    markedQuestions: string[];
    timeSpentSeconds: number;
    timeLimitMinutes: number | null;
    isSubmitted: boolean;
    score: number | null;
    totalQuestions: number;
    correctAnswers: number;
    /** Frozen result questions (set at submit); never copied into `toAttemptView`. */
    resultSnapshot?: unknown;
    startedAt: Date;
    submittedAt: Date | null;
    updatedAt: Date;
}

/** Score and the correct-answer count appear only once the attempt is submitted. */
export function toAttemptView(a: AttemptRow) {
    return {
        id: a.id,
        quizSetId: a.quizSetId,
        type: a.type,
        answers: a.answers,
        currentIndex: a.currentIndex,
        markedQuestions: a.markedQuestions,
        timeSpentSeconds: a.timeSpentSeconds,
        timeLimitMinutes: a.timeLimitMinutes,
        isSubmitted: a.isSubmitted,
        totalQuestions: a.totalQuestions,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        updatedAt: a.updatedAt,
        ...(a.isSubmitted
            ? { score: a.score, correctAnswers: a.correctAnswers }
            : {}),
    };
}

export const toPracticeQuestions = (rows: PracticeQuestionRow[]) =>
    rows.map((q) => ({ id: q.id, question: q.question, options: q.options }));

/** After submit only: the key and per-question verdict. */
export function toResultQuestions(
    rows: PracticeQuestionRow[],
    results: QuestionResult[]
) {
    const byId = new Map(results.map((r) => [r.questionId, r]));
    return rows.map((q) => {
        const r = byId.get(q.id);
        return {
            id: q.id,
            question: q.question,
            options: q.options,
            selectedAnswer: r?.selectedAnswer ?? null,
            correctAnswer: r?.correctAnswer ?? null,
            isCorrect: r?.isCorrect ?? false,
        };
    });
}
