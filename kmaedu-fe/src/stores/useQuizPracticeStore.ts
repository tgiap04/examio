import { create } from "zustand";
import {
  listSharedQuizSetsApi,
  type SharedQuizSetsResponse,
} from "@/apis/quizPracticeApi";

interface QuizPracticeState {
  /** Granted sets per page; reused when you come back to the page in the same session. */
  setsCache: Map<number, SharedQuizSetsResponse>;
  setsLoading: boolean;
  fetchSets: (page: number, limit: number) => Promise<SharedQuizSetsResponse>;
  /** Call after an unlock or a submit: the list (and its `lastAttempt`) changed. */
  invalidateSets: () => void;
}

export const useQuizPracticeStore = create<QuizPracticeState>((set, get) => ({
  setsCache: new Map(),
  setsLoading: false,

  fetchSets: async (page, limit) => {
    const cached = get().setsCache.get(page);
    if (cached) return cached;

    set({ setsLoading: true });
    try {
      const data = await listSharedQuizSetsApi(page, limit);
      set((state) => ({ setsCache: new Map(state.setsCache).set(page, data) }));
      return data;
    } finally {
      set({ setsLoading: false });
    }
  },

  invalidateSets: () => set({ setsCache: new Map() }),
}));
