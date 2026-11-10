/** Pure helpers for the practice page (no React, no network): P09 adds the tests. */

export const AUTOSAVE_DEBOUNCE_MS = 2000;

export interface PracticeProgress {
  answers: Record<string, string>;
  currentIndex: number;
  markedQuestions: string[];
  timeSpentSeconds: number;
}

export interface QuestionLike {
  id: string;
}

/** The body of `PUT /quiz-practice/attempts/:id`: unique marks, whole seconds, no negative index. */
export function buildAutosavePayload(progress: PracticeProgress): PracticeProgress {
  return {
    answers: { ...progress.answers },
    currentIndex: Math.max(0, Math.floor(progress.currentIndex)),
    markedQuestions: [...new Set(progress.markedQuestions)],
    timeSpentSeconds: Math.max(0, Math.floor(progress.timeSpentSeconds)),
  };
}

/** Where to continue after a reload: the saved index, kept inside the question list. */
export function resumeIndex(savedIndex: number, questionCount: number): number {
  if (questionCount <= 0) return 0;
  return Math.min(Math.max(0, Math.floor(savedIndex) || 0), questionCount - 1);
}

/** Stable comparison key: the elapsed time alone must not trigger a save. */
export function changeKey(progress: PracticeProgress): string {
  const { timeSpentSeconds: _ignored, ...rest } = buildAutosavePayload(progress);
  return JSON.stringify(rest);
}

export function toggleMarked(marked: string[], questionId: string): string[] {
  return marked.includes(questionId)
    ? marked.filter((id) => id !== questionId)
    : [...marked, questionId];
}

/** Answers that belong to a question in the list (stale ids from an edited set are ignored). */
export function answeredCount(questions: QuestionLike[], answers: Record<string, string>): number {
  return questions.filter((q) => (answers[q.id] ?? "") !== "").length;
}

export function unansweredCount(questions: QuestionLike[], answers: Record<string, string>): number {
  return questions.length - answeredCount(questions, answers);
}

export type NavigatorState = "current" | "marked" | "answered" | "empty";

export function navigatorState(
  question: QuestionLike,
  index: number,
  currentIndex: number,
  progress: Pick<PracticeProgress, "answers" | "markedQuestions">,
): NavigatorState {
  if (index === currentIndex) return "current";
  if (progress.markedQuestions.includes(question.id)) return "marked";
  return (progress.answers[question.id] ?? "") !== "" ? "answered" : "empty";
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}
