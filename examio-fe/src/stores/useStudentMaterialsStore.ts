import { create } from "zustand"
import {
  getRecentFlashcardSetsApi,
  getRecentExamAttemptsApi,
  type RecentFlashcardSet,
  type RecentExamAttempt,
} from "@/apis/studentMaterialsApi"

interface PaginatedFlashcards {
  flashcardSets: RecentFlashcardSet[]
  total: number
  totalPages: number
}

interface PaginatedExams {
  examAttempts: RecentExamAttempt[]
  total: number
  totalPages: number
}

interface StudentMaterialsState {
  flashcardsCache: Map<number, PaginatedFlashcards>
  examsCache: Map<number, PaginatedExams>
  flashcardsLoading: boolean
  examsLoading: boolean

  fetchFlashcards: (page: number, limit: number) => Promise<PaginatedFlashcards>
  fetchExams: (page: number, limit: number) => Promise<PaginatedExams>
  invalidateFlashcards: () => void
  invalidateExams: () => void
  updateFlashcardPin: (setId: string, pinned: boolean) => void
}

export const useStudentMaterialsStore = create<StudentMaterialsState>((set, get) => ({
  flashcardsCache: new Map(),
  examsCache: new Map(),
  flashcardsLoading: false,
  examsLoading: false,

  fetchFlashcards: async (page: number, limit: number) => {
    const cached = get().flashcardsCache.get(page)
    if (cached) return cached

    set({ flashcardsLoading: true })
    try {
      const data = await getRecentFlashcardSetsApi(limit, page)
      const result: PaginatedFlashcards = {
        flashcardSets: data.flashcardSets,
        total: data.total,
        totalPages: data.totalPages,
      }
      set((state) => {
        const newCache = new Map(state.flashcardsCache)
        newCache.set(page, result)
        return { flashcardsCache: newCache }
      })
      return result
    } finally {
      set({ flashcardsLoading: false })
    }
  },

  fetchExams: async (page: number, limit: number) => {
    const cached = get().examsCache.get(page)
    if (cached) return cached

    set({ examsLoading: true })
    try {
      const data = await getRecentExamAttemptsApi(limit, page)
      const result: PaginatedExams = {
        examAttempts: data.examAttempts,
        total: data.total,
        totalPages: data.totalPages,
      }
      set((state) => {
        const newCache = new Map(state.examsCache)
        newCache.set(page, result)
        return { examsCache: newCache }
      })
      return result
    } finally {
      set({ examsLoading: false })
    }
  },

  invalidateFlashcards: () => {
    set({ flashcardsCache: new Map() })
  },

  invalidateExams: () => {
    set({ examsCache: new Map() })
  },

  updateFlashcardPin: (setId: string, pinned: boolean) => {
    set((state) => {
      const newCache = new Map(state.flashcardsCache)
      for (const [page, data] of newCache) {
        newCache.set(page, {
          ...data,
          flashcardSets: data.flashcardSets.map((m) =>
            m.id === setId ? { ...m, isPinned: pinned } : m
          ),
        })
      }
      return { flashcardsCache: newCache }
    })
  },
}))
