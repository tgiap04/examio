import { storeCache } from "@/lib/storeCache";
import {
  useFlashcardGeneratorStore,
  useJobStore,
  useRecentUploadsStore,
  useTestGeneratorStore,
} from "@/stores/useAIGeneratorStore";
import { useAdminRolesStore } from "@/stores/useAdminRolesStore";
import { useAdminStore } from "@/stores/useAdminStore";
import { useExamRoomDetailStore } from "@/stores/useExamRoomDetailStore";
import { useExamRoomStore } from "@/stores/useExamRoomStore";
import { useExamSessionStore } from "@/stores/useExamSessionStore";
import { useFlashcardSetStore } from "@/stores/useFlashcardSetStore";
import { useQuizPracticeStore } from "@/stores/useQuizPracticeStore";
import { useQuizSetStore } from "@/stores/useQuizSetStore";
import { useStatsStore } from "@/stores/useStatsStore";
import { useStudentMaterialsStore } from "@/stores/useStudentMaterialsStore";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { useWordFamilyStore } from "@/stores/useWordFamilyStore";

interface ResettableStore {
  setState: (state: never, replace: true) => void;
  getInitialState: () => unknown;
}

// Every feature store that can hold role-scoped data. usePageConfigStore is
// excluded on purpose (page flags are global, not per role) and useAuthStore
// is the source of the role change itself.
const ROLE_SCOPED_STORES: readonly ResettableStore[] = [
  useFlashcardGeneratorStore,
  useJobStore,
  useRecentUploadsStore,
  useTestGeneratorStore,
  useAdminRolesStore,
  useAdminStore,
  useExamRoomDetailStore,
  useExamRoomStore,
  useExamSessionStore,
  useFlashcardSetStore,
  useQuizPracticeStore,
  useQuizSetStore,
  useStatsStore,
  useStudentMaterialsStore,
  useStudyRoomStore,
  useWordFamilyStore,
] as unknown as readonly ResettableStore[];

/** Drops every cached, role-dependent client state after a role change. */
export function resetRoleScopedState(): void {
  for (const store of ROLE_SCOPED_STORES) {
    store.setState(store.getInitialState() as never, true);
  }
  storeCache.clear();
}
