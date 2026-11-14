import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { saveAttemptApi } from "@/apis/quizPracticeApi";
import {
  AUTOSAVE_DEBOUNCE_MS,
  buildAutosavePayload,
  changeKey,
  type PracticeProgress,
} from "@/lib/quiz-practice/progress";

/**
 * Keeps an open attempt saved: 2 s after the last change, when the tab is hidden
 * or closed, and (via the returned `save`) right before submit. Also runs the
 * practice clock. A failed save is retried on the next change; the page keeps working.
 */
export function usePracticeAutosave(
  attemptId: string | null,
  progress: PracticeProgress,
  setProgress: Dispatch<SetStateAction<PracticeProgress>>,
) {
  const latest = useRef(progress);
  latest.current = progress;
  const savedKey = useRef("");

  const save = useCallback(async () => {
    const current = latest.current;
    const key = changeKey(current);
    if (!attemptId || key === savedKey.current) return;
    try {
      await saveAttemptApi(attemptId, buildAutosavePayload(current));
      savedKey.current = key;
    } catch (error) {
      console.warn("Autosave failed", error);
    }
  }, [attemptId]);

  const key = changeKey(progress);
  useEffect(() => {
    if (!attemptId) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, attemptId, save]);

  useEffect(() => {
    if (!attemptId) return;
    const flush = () => document.visibilityState === "hidden" && void save();
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    const tick = setInterval(
      () => setProgress((p) => ({ ...p, timeSpentSeconds: p.timeSpentSeconds + 1 })),
      1000,
    );
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
      clearInterval(tick);
    };
  }, [attemptId, save, setProgress]);

  /** The server already holds `saved` (just started or resumed): do not save it again. */
  const markSaved = (saved: PracticeProgress) => {
    savedKey.current = changeKey(saved);
  };

  return { save, markSaved };
}
