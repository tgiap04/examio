import { create } from "zustand";
import {
  getWordFamilyCategoriesApi,
  getRootWordsApi,
  getWordFamilyApi,
  generateWordFamilyApi,
  getWordFamilyGenerationStatusApi,
  generateWordFamilyForRootApi,
  getRootWordFamilyGenerationStatusApi,
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
  // Slug of the category whose "generate more roots" job is running (null = none).
  // Scoped by slug so SPA-navigating between categories can't bleed state.
  generatingSlug: string | null;
  // Key (`${categorySlug}:${rootWord}`) of the single-root regenerate job that is
  // running. Independent from generatingSlug (separate server-side lock) so the
  // two flows never cross-report each other's progress.
  regeneratingKey: string | null;
  // Key (`${slug}:${rootWord}`) of the detail the user is currently viewing.
  // Used to discard stale async results after SPA-navigation to another root.
  activeDetailKey: string | null;
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
  generateWordFamilyForRoot: (
    categorySlug: string,
    rootWord: string,
  ) => Promise<boolean>;
  checkRootGenerationStatus: (
    categorySlug: string,
    rootWord: string,
  ) => Promise<boolean>;
  abandonRootGeneration: (categorySlug: string, rootWord: string) => void;
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
  regeneratingKey: null,
  activeDetailKey: null,
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
    const detailKey = `${categorySlug}:${rootWord}`;
    const cached = storeCache.get<WordFamilyData>(key, CacheTTL.FIVE_MINUTES);
    if (!forceRefresh && cached) {
      set({ currentWordFamily: cached, loadingDetail: false, activeDetailKey: detailKey });
      return;
    }
    if (get().loadingDetail) return;
    set({ loadingDetail: true, error: null, activeDetailKey: detailKey });
    try {
      const data = await getWordFamilyApi(categorySlug, rootWord);
      storeCache.set(key, data);
      // Discard if the user navigated to a different root while this was in flight.
      if (get().activeDetailKey !== detailKey) return;
      set({ currentWordFamily: data, loadingDetail: false });
    } catch (err) {
      if (get().activeDetailKey !== detailKey) return;
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

  generateWordFamilyForRoot: async (categorySlug, rootWord) => {
    // Kick off a background job on the server and return immediately. The caller
    // polls checkRootGenerationStatus(categorySlug, rootWord) and refetches the
    // detail once the root-specific lock clears.
    const key = `${categorySlug}:${rootWord}`;
    set({ regeneratingKey: key, error: null });
    try {
      await generateWordFamilyForRootApi({ categorySlug, rootWord });
      // Stale detail/roots caches must not mask the freshly generated data.
      storeCache.invalidate(`wf:detail:${categorySlug}:${rootWord}`);
      storeCache.invalidate(`wf:roots:${categorySlug}`);
      return true;
    } catch (err) {
      set((s) => ({
        regeneratingKey: s.regeneratingKey === key ? null : s.regeneratingKey,
        error: (err as Error).message,
      }));
      return false;
    }
  },

  checkRootGenerationStatus: async (categorySlug, rootWord) => {
    const key = `${categorySlug}:${rootWord}`;
    try {
      const { generating } = await getRootWordFamilyGenerationStatusApi(
        categorySlug,
        rootWord,
      );
      set((s) => ({
        regeneratingKey: generating
          ? key
          : s.regeneratingKey === key
            ? null
            : s.regeneratingKey,
      }));
      return generating;
    } catch (err) {
      // Status unknown: keep current state and keep polling rather than falsely
      // reporting "done" (a persistent 401 tears the page down via interceptor).
      console.error("Failed to check root word-family generation status:", err);
      return get().regeneratingKey === key;
    }
  },

  abandonRootGeneration: (categorySlug, rootWord) => {
    const key = `${categorySlug}:${rootWord}`;
    set((s) => ({
      regeneratingKey: s.regeneratingKey === key ? null : s.regeneratingKey,
      error:
        "Quá trình sinh từ con mất nhiều thời gian hơn dự kiến. Vui lòng thử lại sau.",
    }));
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
