import { api } from "./api";
import type {
  WordFamilyCategory,
  WordFamilyData,
  WordFamilyRootWord,
  WordFamilyRecord,
} from "@/types/wordFamily";

// ==================== Request Types ====================

export interface GenerateWordFamilyBody {
  categorySlug: string;
  numRootWords?: number;
  excludeRootWords?: string[];
}

export interface CreateCategoryBody {
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  order?: number;
}

export interface UpdateCategoryBody {
  name?: string;
  description?: string;
  imageUrl?: string;
  order?: number;
  isActive?: boolean;
}

export interface ToFlashcardBody {
  selectedIndices?: number[];
}

// ==================== Response Types ====================

export interface CategoryRootWordsResponse {
  category: WordFamilyCategory;
  rootWords: WordFamilyRootWord[];
  total: number;
}

export interface CreateFlashcardResponse {
  message: string;
  flashCardSetId: string;
  cardCount: number;
}

export interface GenerationStatusResponse {
  categorySlug: string;
  generating: boolean;
  startedAt: string | null;
}

// ==================== User Endpoints ====================

export async function getWordFamilyCategoriesApi(): Promise<WordFamilyCategory[]> {
  const response = await api.get("/word-family/categories");
  return response.data;
}

export async function getRootWordsApi(
  slug: string,
): Promise<CategoryRootWordsResponse> {
  const response = await api.get(`/word-family/categories/${slug}/roots`);
  return response.data;
}

export async function getWordFamilyApi(
  categorySlug: string,
  rootWord: string,
): Promise<WordFamilyData> {
  const response = await api.get(
    `/word-family/category/${categorySlug}/${rootWord}`,
  );
  return response.data;
}

export async function generateWordFamilyApi(
  body: GenerateWordFamilyBody,
): Promise<WordFamilyRecord> {
  const response = await api.post("/word-family/generate", body);
  return response.data;
}

export async function getWordFamilyGenerationStatusApi(
  slug: string,
): Promise<GenerationStatusResponse> {
  const response = await api.get(`/word-family/generation-status/${slug}`);
  return response.data;
}

export async function saveWordFamilyApi(
  wordFamilyId: string,
): Promise<{ message: string }> {
  const response = await api.post("/word-family/save", { wordFamilyId });
  return response.data;
}

export async function getSavedWordFamiliesApi(): Promise<WordFamilyRecord[]> {
  const response = await api.get("/word-family/saved");
  return response.data;
}

export async function removeSavedWordFamilyApi(
  wordFamilyId: string,
): Promise<{ message: string }> {
  const response = await api.delete(`/word-family/saved/${wordFamilyId}`);
  return response.data;
}

export async function createFlashcardFromWordFamilyApi(
  wordFamilyId: string,
  body?: ToFlashcardBody,
): Promise<CreateFlashcardResponse> {
  const response = await api.post(
    `/word-family/${wordFamilyId}/to-flashcard`,
    body ?? {},
  );
  return response.data;
}

// ==================== Admin Endpoints ====================

export async function adminListCategoriesApi(): Promise<WordFamilyCategory[]> {
  const response = await api.get("/admin/word-family/categories");
  return response.data;
}

export async function adminCreateCategoryApi(
  body: CreateCategoryBody,
): Promise<WordFamilyCategory> {
  const response = await api.post("/admin/word-family/categories", body);
  return response.data;
}

export async function adminUpdateCategoryApi(
  id: string,
  body: UpdateCategoryBody,
): Promise<WordFamilyCategory> {
  const response = await api.put(
    `/admin/word-family/categories/${id}`,
    body,
  );
  return response.data;
}

export async function adminDeleteCategoryApi(
  id: string,
): Promise<{ message: string; category: WordFamilyCategory }> {
  const response = await api.delete(
    `/admin/word-family/categories/${id}`,
  );
  return response.data;
}
