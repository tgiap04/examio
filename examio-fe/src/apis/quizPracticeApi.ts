import { api } from "./api";
import { acceptDomainStatuses, unwrap } from "@/lib/quiz-practice/api-failure";
import type { PracticeProgress } from "@/lib/quiz-practice/progress";

// ==================== Types ====================

export interface PracticeQuestion {
  id: string;
  question: string;
  options: string[];
}

/** After submit only: the key and the verdict per question. */
export interface ResultQuestion extends PracticeQuestion {
  selectedAnswer: string | null;
  correctAnswer: string | null;
  isCorrect: boolean;
}

export interface PracticeAttempt {
  id: string;
  quizSetId: string;
  answers: Record<string, string>;
  currentIndex: number;
  markedQuestions: string[];
  timeSpentSeconds: number;
  timeLimitMinutes: number | null;
  isSubmitted: boolean;
  totalQuestions: number;
  startedAt: string;
  submittedAt: string | null;
  updatedAt: string;
  /** Present once submitted. */
  score?: number | null;
  correctAnswers?: number;
}

export interface AttemptWithQuestions<Q = PracticeQuestion> {
  attempt: PracticeAttempt;
  questions: Q[];
}

export interface SharedQuizSet {
  id: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  questionCount: number;
  owner: { name: string | null } | null;
  lastAttempt: {
    id: string;
    isSubmitted: boolean;
    score: number | null;
    updatedAt: string;
  } | null;
}

export interface SharedQuizSetsResponse {
  sets: SharedQuizSet[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type AccessReason = "owner" | "public" | "whitelist" | "code" | null;

export interface QuizSetAccess {
  /** Missing for an anonymous caller on a code-protected set. */
  title?: string;
  questionCount?: number;
  canAccess: boolean;
  requiresCode: boolean;
  reason: AccessReason;
}

export interface AttemptHistoryItem {
  id: string;
  quizSetId: string;
  score: number | null;
  totalQuestions: number;
  correctAnswers: number;
  timeSpentSeconds: number;
  startedAt: string;
  submittedAt: string | null;
  quizSet: { title: string };
}

export interface AttemptHistoryResponse {
  attempts: AttemptHistoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ==================== API Functions ====================

const domain = { validateStatus: acceptDomainStatuses };

export async function listSharedQuizSetsApi(
  page = 1,
  limit = 12,
): Promise<SharedQuizSetsResponse> {
  const response = await api.get("/quiz-practice/sets", { params: { page, limit } });
  return response.data;
}

export async function getQuizSetAccessApi(quizSetId: string): Promise<QuizSetAccess> {
  const response = await api.get(`/quiz-practice/sets/${quizSetId}/access`);
  return response.data;
}

/** 400 INVALID_CODE and 429 CODE_LOCKED arrive as an `ApiFailure`. */
export async function unlockQuizSetApi(quizSetId: string, code: string): Promise<void> {
  unwrap(
    await api.post(`/quiz-practice/sets/${quizSetId}/unlock`, { code }, domain),
  );
}

/** Starts a new attempt or resumes the open one. Questions come without answers. */
export async function startAttemptApi(quizSetId: string): Promise<AttemptWithQuestions> {
  const response = await api.post("/quiz-practice/attempts", { quizSetId });
  return response.data;
}

export async function getAttemptApi(
  attemptId: string,
): Promise<AttemptWithQuestions<PracticeQuestion | ResultQuestion>> {
  const response = await api.get(`/quiz-practice/attempts/${attemptId}`);
  return response.data;
}

/** 409 ALREADY_SUBMITTED arrives as an `ApiFailure`. */
export async function saveAttemptApi(
  attemptId: string,
  progress: PracticeProgress,
): Promise<void> {
  unwrap(await api.put(`/quiz-practice/attempts/${attemptId}`, progress, domain));
}

/** The server scores from the saved answers; nothing about a score is sent. */
export async function submitAttemptApi(
  attemptId: string,
): Promise<AttemptWithQuestions<ResultQuestion>> {
  return unwrap(
    await api.post(`/quiz-practice/attempts/${attemptId}/submit`, undefined, domain),
  );
}

export async function listAttemptsApi(params: {
  quizSetId?: string;
  page?: number;
  limit?: number;
}): Promise<AttemptHistoryResponse> {
  const response = await api.get("/quiz-practice/attempts", { params });
  return response.data;
}
