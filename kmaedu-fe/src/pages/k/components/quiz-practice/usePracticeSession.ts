import { useCallback, useEffect, useState } from "react";
import {
  getAttemptApi,
  getQuizSetAccessApi,
  startAttemptApi,
  submitAttemptApi,
  unlockQuizSetApi,
  type AttemptWithQuestions,
  type PracticeAttempt,
  type PracticeQuestion,
  type QuizSetAccess,
  type ResultQuestion,
} from "@/apis/quizPracticeApi";
import { ApiFailure, isFailure, lockedMessage } from "@/lib/quiz-practice/api-failure";
import {
  resumeIndex,
  toggleMarked,
  type PracticeProgress,
} from "@/lib/quiz-practice/progress";
import { usePracticeAutosave } from "./usePracticeAutosave";
import { useQuizPracticeStore } from "@/stores/useQuizPracticeStore";

export type Phase = "loading" | "code" | "intro" | "practice" | "result" | "unavailable";

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/** Everything the practice page needs: access check, code unlock, start/resume, autosave, submit. */
export function usePracticeSession(quizSetId: string) {
  const invalidateSets = useQuizPracticeStore((s) => s.invalidateSets);
  const [phase, setPhase] = useState<Phase>("loading");
  const [access, setAccess] = useState<QuizSetAccess | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<PracticeAttempt | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [progress, setProgress] = useState<PracticeProgress>({
    answers: {},
    currentIndex: 0,
    markedQuestions: [],
    timeSpentSeconds: 0,
  });
  const [result, setResult] = useState<AttemptWithQuestions<ResultQuestion> | null>(null);

  const attemptId = attempt && !attempt.isSubmitted ? attempt.id : null;
  const { save, markSaved } = usePracticeAutosave(attemptId, progress, setProgress);

  const loadAccess = useCallback(async () => {
    setPhase("loading");
    try {
      const info = await getQuizSetAccessApi(quizSetId);
      setAccess(info);
      setPhase(info.canAccess ? "intro" : info.requiresCode ? "code" : "unavailable");
    } catch (error) {
      setProblem(messageOf(error, "Không thể tải bộ câu hỏi"));
      setPhase("unavailable");
    }
  }, [quizSetId]);

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

  const unlock = async (code: string) => {
    setBusy(true);
    setProblem(null);
    try {
      await unlockQuizSetApi(quizSetId, code);
      invalidateSets();
      await loadAccess();
    } catch (error) {
      if (isFailure(error, "CODE_LOCKED")) {
        setLocked(true);
        setProblem(lockedMessage((error as ApiFailure).retryAfterSeconds));
      } else {
        setProblem(isFailure(error, "INVALID_CODE") ? "Mã không đúng" : messageOf(error, "Không thể mở bộ câu hỏi"));
      }
    } finally {
      setBusy(false);
    }
  };

  const begin = (data: AttemptWithQuestions) => {
    setAttempt(data.attempt);
    setQuestions(data.questions);
    const next: PracticeProgress = {
      answers: data.attempt.answers ?? {},
      currentIndex: resumeIndex(data.attempt.currentIndex, data.questions.length),
      markedQuestions: data.attempt.markedQuestions ?? [],
      timeSpentSeconds: data.attempt.timeSpentSeconds,
    };
    markSaved(next);
    setProgress(next);
    setResult(null);
    setPhase("practice");
  };

  const start = async () => {
    setBusy(true);
    setProblem(null);
    try {
      begin(await startAttemptApi(quizSetId));
    } catch (error) {
      setProblem(messageOf(error, "Không thể bắt đầu luyện tập"));
    } finally {
      setBusy(false);
    }
  };

  const update = (patch: Partial<PracticeProgress>) => setProgress((p) => ({ ...p, ...patch }));

  const submit = async () => {
    if (!attemptId) return;
    setBusy(true);
    try {
      await save();
      const done = await submitAttemptApi(attemptId);
      invalidateSets();
      setAttempt(done.attempt);
      setResult(done);
      setPhase("result");
    } catch (error) {
      if (isFailure(error, "ALREADY_SUBMITTED")) {
        await openAttempt(attemptId);
      } else {
        setProblem(messageOf(error, "Không thể nộp bài"));
      }
    } finally {
      setBusy(false);
    }
  };

  /** Opens a submitted attempt (from the history list) in the result view. */
  async function openAttempt(id: string) {
    try {
      const data = await getAttemptApi(id);
      if (data.attempt.isSubmitted) {
        setResult(data as AttemptWithQuestions<ResultQuestion>);
        setAttempt(data.attempt);
        setPhase("result");
      }
    } catch (error) {
      setProblem(messageOf(error, "Không thể tải bài luyện tập"));
    }
  }

  return {
    phase,
    access,
    problem,
    locked,
    busy,
    questions,
    progress,
    result,
    unlock,
    start,
    submit,
    openAttempt,
    backToIntro: () => setPhase("intro"),
    go: (index: number) => update({ currentIndex: resumeIndex(index, questions.length) }),
    select: (questionId: string, letter: string) =>
      update({ answers: { ...progress.answers, [questionId]: letter } }),
    mark: (questionId: string) =>
      update({ markedQuestions: toggleMarked(progress.markedQuestions, questionId) }),
  };
}
