import { api } from "./api";

// ==================== Types ====================

export interface RecentFlashcardSet {
  id: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  viewCount: number;
  flashcardCount: number;
  lastViewedAt: string;
  createdAt: string;
  creator: {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
  };
  isPublic: boolean;
  isPinned: boolean;
  progress?: number;
}

export interface RecentExamAttempt {
  id: string;
  examSessionId: string;
  score: number;
  violationCount: number;
  startedAt: string;
  finishedAt: string | null;
  status: number;
  totalQuestions: number;
  correctAnswers: number;
  timeRemaining: number | null;
  isPinned: boolean;
  examSession: {
    id: string;
    startTime: string;
    endTime: string | null;
    timeLimitMinutes: number | null;
    showAnswersAfterSubmit: boolean;
    examRoom: {
      id: string;
      title: string;
      description: string | null;
    };
  };
}

export interface RecentMaterialsResponse {
  flashcardSets: RecentFlashcardSet[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RecentExamsResponse {
  examAttempts: RecentExamAttempt[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ==================== API Functions ====================

export async function getRecentFlashcardSetsApi(
  limit: number = 10,
  page: number = 1
): Promise<RecentMaterialsResponse> {
  const response = await api.get("/student/recent-flashcards", {
    params: { limit, page },
  });
  return response.data;
}

export async function getRecentExamAttemptsApi(
  limit: number = 10,
  page: number = 1
): Promise<RecentExamsResponse> {
  const response = await api.get("/student/recent-exams", {
    params: { limit, page },
  });
  return response.data;
}

export async function generateShareLinkApi(
  flashcardSetId: string
): Promise<{ shareUrl: string; accessCode: string }> {
  const response = await api.post(`/flashcardsets/${flashcardSetId}/share`);
  return response.data;
}

export async function togglePinFlashcardApi(
  flashcardSetId: string
): Promise<{ pinned: boolean }> {
  const response = await api.post(`/student/pin-flashcard/${flashcardSetId}`);
  return response.data;
}

export async function togglePinExamRoomApi(
  examRoomId: string
): Promise<{ pinned: boolean }> {
  const response = await api.post(`/student/pin-exam-room/${examRoomId}`);
  return response.data;
}
