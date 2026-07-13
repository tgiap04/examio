import { create } from "zustand";
import {
  getWordFamilyCategoriesApi,
  getRootWordsApi,
  getWordFamilyApi,
  generateWordFamilyApi,
  getWordFamilyGenerationStatusApi,
  saveWordFamilyApi,
  getSavedWordFamiliesApi,
  removeSavedWordFamilyApi,
  createFlashcardFromWordFamilyApi,
  type GenerateWordFamilyBody,
} from "@/apis/wordFamilyApi";
import type {
  WordFamilyCategory,
  WordFamilyData,
  WordFamilyRootWord,
} from "@/types/wordFamily";
import { storeCache, CacheTTL } from "@/lib/storeCache";

interface CategoryRootWords {
  category: WordFamilyCategory;
  rootWords: WordFamilyRootWord[];
  total: number;
}

interface WordFamilyState {
  categories: WordFamilyCategory[];
  currentCategory: CategoryRootWords | null;
  currentWordFamily: WordFamilyData | null;
  savedIds: Set<string>;
  // Slug of the category whose generation job is currently running (null = none).
  // Scoped by slug so SPA-navigating between categories can't bleed state.
  generatingSlug: string | null;
  loadingCategories: boolean;
  loadingRootWords: boolean;
  loadingDetail: boolean;
  error: string | null;

  fetchCategories: (forceRefresh?: boolean) => Promise<void>;
  fetchRootWords: (slug: string, forceRefresh?: boolean) => Promise<void>;
  fetchWordFamily: (
    categorySlug: string,
    rootWord: string,
    forceRefresh?: boolean,
  ) => Promise<void>;
  generateWordFamily: (body: GenerateWordFamilyBody) => Promise<boolean>;
  checkGenerationStatus: (slug: string) => Promise<boolean>;
  abandonGeneration: (slug: string) => void;
  saveWordFamily: (wordFamilyId: string) => Promise<boolean>;
  fetchSaved: (forceRefresh?: boolean) => Promise<void>;
  removeSaved: (wordFamilyId: string) => Promise<boolean>;
  createFlashcard: (
    wordFamilyId: string,
    selectedIndices?: number[],
  ) => Promise<{ flashCardSetId: string; cardCount: number } | null>;
  clearCurrent: () => void;
}

export const useWordFamilyStore = create<WordFamilyState>((set, get) => ({
  categories: [],
  currentCategory: null,
  currentWordFamily: null,
  savedIds: new Set(),
  generatingSlug: null,
  loadingCategories: false,
  loadingRootWords: false,
  loadingDetail: false,
  error: null,

  fetchCategories: async (forceRefresh = false) => {
    const key = "wf:categories";
    const cached = storeCache.get<WordFamilyCategory[]>(key, CacheTTL.THIRTY_MINUTES);
    if (!forceRefresh && cached) {
      set({ categories: cached, loadingCategories: false });
      return;
    }
    if (get().loadingCategories) return;
    set({ loadingCategories: true, error: null });
    try {
      const data = await getWordFamilyCategoriesApi();
      storeCache.set(key, data);
      set({ categories: data, loadingCategories: false });
    } catch (err) {
      set({ loadingCategories: false, error: (err as Error).message });
    }
  },

  fetchRootWords: async (slug, forceRefresh = false) => {
    const key = `wf:roots:${slug}`;
    const cached = storeCache.get<CategoryRootWords>(key, CacheTTL.FIVE_MINUTES);
    if (!forceRefresh && cached) {
      set({ currentCategory: cached, loadingRootWords: false });
      return;
    }
    if (get().loadingRootWords) return;
    set({ loadingRootWords: true, error: null });
    try {
      const data = await getRootWordsApi(slug);
      storeCache.set(key, data);
      set({ currentCategory: data, loadingRootWords: false });
    } catch (err) {
      set({ loadingRootWords: false, error: (err as Error).message });
    }
  },

  fetchWordFamily: async (categorySlug, rootWord, forceRefresh = false) => {
    const key = `wf:detail:${categorySlug}:${rootWord}`;
    const cached = storeCache.get<WordFamilyData>(key, CacheTTL.FIVE_MINUTES);
    if (!forceRefresh && cached) {
      set({ currentWordFamily: cached, loadingDetail: false });
      return;
    }
    if (get().loadingDetail) return;
    set({ loadingDetail: true, error: null });
    try {
      const data = await getWordFamilyApi(categorySlug, rootWord);
      storeCache.set(key, data);
      set({ currentWordFamily: data, loadingDetail: false });
    } catch (err) {
      set({ loadingDetail: false, error: (err as Error).message });
    }
  },

  generateWordFamily: async (body) => {
    set({ generatingSlug: body.categorySlug, error: null });
    try {
      await generateWordFamilyApi(body);
      // Invalidate category roots cache
      storeCache.invalidate(`wf:roots:${body.categorySlug}`);
      set((s) => ({
        generatingSlug:
          s.generatingSlug === body.categorySlug ? null : s.generatingSlug,
      }));
      return true;
    } catch (err) {
      set((s) => ({
        generatingSlug:
          s.generatingSlug === body.categorySlug ? null : s.generatingSlug,
        error: (err as Error).message,
      }));
      return false;
    }
  },

  checkGenerationStatus: async (slug) => {
    try {
      const { generating } = await getWordFamilyGenerationStatusApi(slug);
      set((s) => ({
        generatingSlug: generating
          ? slug
          : s.generatingSlug === slug
            ? null
            : s.generatingSlug,
      }));
      return generating;
    } catch (err) {
      // Status unknown on error: keep the current state and keep polling rather
      // than falsely reporting "done" (which would clear the banner and spam a
      // forced roots refetch). A persistent 401 unmounts the page via the axios
      // interceptor, which tears the poll down.
      console.error("Failed to check word-family generation status:", err);
      return get().generatingSlug === slug;
    }
  },

  abandonGeneration: (slug) => {
    set((s) => ({
      generatingSlug: s.generatingSlug === slug ? null : s.generatingSlug,
      error:
        "Quá trình sinh word family mất nhiều thời gian hơn dự kiến. Vui lòng thử lại sau.",
    }));
  },

  saveWordFamily: async (wordFamilyId) => {
    try {
      await saveWordFamilyApi(wordFamilyId);
      storeCache.invalidate("wf:saved");
      const ids = new Set(get().savedIds);
      ids.add(wordFamilyId);
      set({ savedIds: ids });
      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },

  fetchSaved: async (forceRefresh = false) => {
    const key = "wf:saved";
    const cached = storeCache.get<unknown[]>(key, CacheTTL.FIVE_MINUTES);
    if (!forceRefresh && cached) {
      set({ savedIds: new Set(cached.map((r: any) => r.id)) });
      return;
    }
    try {
      const data = await getSavedWordFamiliesApi();
      storeCache.set(key, data);
      set({ savedIds: new Set(data.map((r) => r.id)) });
    } catch {
      // silent — non-critical
    }
  },

  removeSaved: async (wordFamilyId) => {
    try {
      await removeSavedWordFamilyApi(wordFamilyId);
      storeCache.invalidate("wf:saved");
      const ids = new Set(get().savedIds);
      ids.delete(wordFamilyId);
      set({ savedIds: ids });
      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },

  createFlashcard: async (wordFamilyId, selectedIndices) => {
    try {
      const result = await createFlashcardFromWordFamilyApi(wordFamilyId, {
        selectedIndices,
      });
      return { flashCardSetId: result.flashCardSetId, cardCount: result.cardCount };
    } catch (err) {
      set({ error: (err as Error).message });
      return null;
    }
  },

  clearCurrent: () => {
    set({ currentCategory: null, currentWordFamily: null });
  },
}));
