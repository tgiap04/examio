import { api } from "./api";

export interface GetProgressResponse {
  studiedCardIds: string[];
  totalCards: number;
  progressPercentage: number;
}

/**
 * Get progress for a flashcard set
 */
export async function getProgressApi(
  flashCardSetId: string
): Promise<GetProgressResponse> {
  const response = await api.get(`/flashcard-study/progress/${flashCardSetId}`);
  return response.data;
}

/**
 * Save study progress for a flashcard set
 */
export async function saveProgressApi(
  flashCardSetId: string,
  studiedCardIds: string[]
): Promise<GetProgressResponse> {
  const response = await api.post(`/flashcard-study/progress/${flashCardSetId}`, {
    studiedCardIds,
  });
  return response.data;
}

/**
 * Add a single studied card to progress (only call when card is new)
 */
export async function addStudiedCardApi(
  flashCardSetId: string,
  cardId: string
): Promise<GetProgressResponse> {
  const response = await api.post(`/flashcard-study/progress/${flashCardSetId}`, {
    cardId,
  });
  return response.data;
}
