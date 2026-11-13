 
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation, useSearchParams } from "react-router-dom";
import { Button } from "@/components/antd/button";
import { Card, CardContent } from "@/components/antd/card";
import { Progress } from "@/components/antd/progress";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Loader2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { setRedirectBackTarget } from "@/lib/authRedirect";
import { useAuthStore } from "@/stores/useAuthStore";
import { resolveAnswerIndex } from "@/lib/quizAnswerUtils";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";
import { toast } from "@/components/antd/toast";
import { useDebounce } from "@/hooks/useDebounce";
import { useCheatingDetection } from "@/hooks/useCheatingDetection";
import { CheatingWarningModal } from "@/components/molecules/CheatingWarningModal";
import { StandardMarkdownRenderer } from "@/components/molecules/StandardMarkdownRenderer";
import { startExamAttemptApi, updateExamAttemptProgressApi, getExamAttemptDetailApi, type Question } from "@/apis/examAttemptApi";
import { QuizOptionRow } from "@/components/molecules/QuizOptionRow";
import { env } from "@/lib/env";
import {
  fetchAndDecryptSecureQuiz,
  submitSecureQuiz,
  type DecryptedQuestion,
  type QuestionTokenMap,
} from "@/lib/secureQuizHelpers";

export default function ExamQuizPage() {
  const { id: examSessionId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, initializing } = useAuthStore();

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [questions, setQuestions] = useState<DecryptedQuestion[]>([]);
  const [searchParams] = useSearchParams();
  const [tokenMap, setTokenMap] = useState<QuestionTokenMap>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [markedForReview, setMarkedForReview] = useState<Set<string>>(() => new Set<string>());
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showDetailedResults, setShowDetailedResults] = useState(false);
  const [reviewQuestionIndex, setReviewQuestionIndex] = useState(0);
  const [resultData, setResultData] = useState<{
    score: number;
    totalQuestions: number;
    correctAnswers: number;
    percentage: number;
    showAnswers: boolean;
    passed: boolean;
    passingScore: number;
    violationCount: number;
    questions?: Question[];
  } | null>(null);
  const [timeSpentSeconds, setTimeSpentSeconds] = useState(() => 0);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [hasWarned30s, setHasWarned30s] = useState(false);

  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  const debouncedAnswers = useDebounce(answers, 1000);
  const debouncedCurrentIndex = useDebounce(currentQuestionIndex, 1000);

  const cheatingDetection = useCheatingDetection({
    examAttemptId: attemptId || "",
    enabled: !!attemptId && !isSubmitted && !loading,
  });

  useEffect(() => {
    if (initializing || isAuthenticated) {
      return;
    }

    setRedirectBackTarget(returnTo);
    navigate(`/login?from=${encodeURIComponent(returnTo)}`, { replace: true });
  }, [initializing, isAuthenticated, returnTo, navigate]);

  const saveProgress = useCallback(
    async (overrideAnswers?: Record<string, string>) => {
      if (!attemptId || isSubmitted) return;

      const answersToSave = overrideAnswers ?? answers;

      try {
        await updateExamAttemptProgressApi(attemptId, {
          answers: answersToSave,
          currentIndex: currentQuestionIndex,
          markedQuestions: Array.from(markedForReview),
        });
      } catch (err) {
        console.error("Failed to save progress:", err);
      }
    },
    [attemptId, answers, currentQuestionIndex, markedForReview, isSubmitted],
  );

  const autoSubmittingRef = useRef(false);
  const [autoSubmitFailed, setAutoSubmitFailed] = useState(false);

  const handleAutoSubmit = useCallback(async () => {
    if (!attemptId || tokenMap.size === 0) return;
    // Re-entry guard: the time-up effect re-fires every second; don't stack
    // overlapping auto-submits.
    if (autoSubmittingRef.current) return;
    autoSubmittingRef.current = true;

    try {
      await updateExamAttemptProgressApi(attemptId, {
        answers,
        currentIndex: currentQuestionIndex,
        markedQuestions: Array.from(markedForReview),
      });

      const result = await submitSecureQuiz(attemptId, answers, tokenMap);
      setResultData({
        score: result.score,
        totalQuestions: result.totalQuestions,
        correctAnswers: result.correctAnswers,
        percentage: result.percentage,
        showAnswers: result.showAnswers,
        passed: result.passed,
        passingScore: result.passingScore,
        violationCount: cheatingDetection.totalViolations,
        questions: result.questions,
      });
      setIsSubmitted(true);
      toast.info("Đã hết thời gian", {
        description: "Bài thi đã được tự động nộp",
      });
    } catch (err: any) {
      // Stop the per-second retry loop and surface the reason, so the user
      // isn't stuck on the quiz with no feedback (e.g. stale tokens after a
      // secret rotation, or timer drift past JWT expiry). Answers stay saved.
      console.error("Failed to auto-submit:", err);
      setAutoSubmitFailed(true);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Không thể tự động nộp bài. Vui lòng tải lại trang rồi nộp lại — câu trả lời của bạn vẫn được lưu.";
      toast.error(message);
    } finally {
      autoSubmittingRef.current = false;
    }
  }, [attemptId, answers, currentQuestionIndex, markedForReview, tokenMap]);

  useEffect(() => {
    if (!examSessionId || initializing || !isAuthenticated) return;

    const initExam = async () => {
      // Reset all quiz state before (re-)initializing
      setLoading(true);
      setError(null);
      setIsSubmitted(false);
      setResultData(null);
      setQuestions([]);
      setAnswers({});
      setMarkedForReview(new Set());
      setCurrentQuestionIndex(0);
      setAttemptId(null);
      setIsViewOnly(false);
      setShowDetailedResults(false);
      setTimeSpentSeconds(0);
      setHasWarned30s(false);

      const urlAttemptId = searchParams.get("attemptId");
      const urlViewResult = searchParams.get("view") === "result";

      try {
        // Case 1: view=result — load completed attempt detail
        if (urlViewResult && urlAttemptId) {
          setAttemptId(urlAttemptId);
          setIsViewOnly(true);

          const detail = await getExamAttemptDetailApi(urlAttemptId);

          // Backend now returns userAnswer per question directly.
          const resultQuestions: Question[] = (detail.questions || []).map((q) => ({
            id: q.id,
            question: q.question,
            options: q.options,
            answer: q.answer,
            userAnswer: q.userAnswer ?? null,
          }));
          const correctCount = resultQuestions.filter(
            (q) => q.answer !== undefined && q.userAnswer === q.answer,
          ).length;
          const percentage =
            resultQuestions.length > 0
              ? Math.round((correctCount / resultQuestions.length) * 100)
              : 0;

          setQuestions([]);
          setAnswers(detail.examAttempt.answers || {});
          setCurrentQuestionIndex(0);

          setResultData({
            score: detail.examAttempt.score || 0,
            totalQuestions: resultQuestions.length,
            correctAnswers: correctCount,
            percentage,
            showAnswers: true,
            passed: percentage >= (detail.passingScore || 0),
            passingScore: detail.passingScore || 0,
            violationCount: detail.violationCount || 0,
            questions: resultQuestions,
          });
          setIsSubmitted(true);
          setTimeSpentSeconds(detail.examAttempt.timeSpentSeconds || 0);

          toast.success("Đang xem kết quả", {
            description: detail.examRoom?.title ?? "Bài thi đã hoàn thành",
          });

          return;
        }

        // Case 2 & 3: normal flow (new or resume). Forward the verified access
        // code (if any) so the server can enforce access for code-gated
        // sessions when the attempt is created (C3).
        const storedAccessCode =
          sessionStorage.getItem(`kmaedu:exam-code:${examSessionId}`) ?? undefined;
        const startResult = await startExamAttemptApi(
          examSessionId,
          storedAccessCode,
        );
        setAttemptId(startResult.examAttempt.id);

        const secureQuizData = await fetchAndDecryptSecureQuiz(startResult.examAttempt.id);

        setQuestions(secureQuizData.questions);
        setTokenMap(secureQuizData.tokenMap);

        const savedAnswers = secureQuizData.savedAnswers || {};
        setAnswers(savedAnswers);
        setCurrentQuestionIndex(secureQuizData.currentIndex || 0);
        setMarkedForReview(new Set(secureQuizData.markedQuestions || []));

        if (secureQuizData.startedAt) {
          const startedAtDate = new Date(secureQuizData.startedAt);
          const now = new Date();
          const elapsedSeconds = Math.floor((now.getTime() - startedAtDate.getTime()) / 1000);
          setTimeSpentSeconds(Math.max(0, elapsedSeconds));
        }

        if (startResult.isResume && Object.keys(savedAnswers).length > 0) {
          toast.info("Tiếp tục làm bài", {
            description: "Dữ liệu của bạn đã được khôi phục",
          });
        }

        setTimeLimitMinutes(secureQuizData.timeLimitMinutes);

        if (secureQuizData.status === 1) {
          setIsSubmitted(true);
          setResultData({
            score: 0,
            totalQuestions: secureQuizData.totalQuestions,
            correctAnswers: 0,
            percentage: 0,
            showAnswers: false,
            passed: false,
            passingScore: 0,
            violationCount: 0,
            questions: undefined,
          });
        }
      } catch (err: any) {
        const message = err?.response?.data?.message || err?.message || "Không thể bắt đầu bài thi";
        // Access denied (e.g. code-gated session opened without a verified
        // code) — send the user to the session page to enter the access code
        // instead of dead-ending here.
        if (err?.response?.status === 403) {
          toast.error(message);
          navigate(`/exam-session/${examSessionId}`, { replace: true });
          return;
        }
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    };

    initExam();
  }, [examSessionId, initializing, isAuthenticated, location.key]);

  useEffect(() => {
    if (!loading && !isSubmitted && questions.length > 0) {
      timerRef.current = setInterval(() => {
        setTimeSpentSeconds((prev) => prev + 1);
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [loading, isSubmitted, questions.length]);

  useEffect(() => {
    if (timeLimitMinutes && !loading && !isSubmitted) {
      const timeLimitSeconds = timeLimitMinutes * 60;
      const remainingSeconds = timeLimitSeconds - timeSpentSeconds;

      if (remainingSeconds <= 30 && remainingSeconds > 0 && !hasWarned30s) {
        setHasWarned30s(true);
        toast.warning("Sắp hết thời gian!", {
          description: "Còn 30 giây nữa sẽ tự động nộp bài",
        });
      }

      // Stop retrying once an auto-submit has failed — otherwise this effect
      // re-fires every second and loops the same error forever.
      if (remainingSeconds <= 0 && !autoSubmitFailed) {
        handleAutoSubmit();
      }
    }
  }, [timeSpentSeconds, timeLimitMinutes, loading, isSubmitted, hasWarned30s, handleAutoSubmit, autoSubmitFailed]);

  useEffect(() => {
    if (attemptId && !loading && !isSubmitted) {
      saveProgress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedAnswers, debouncedCurrentIndex]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (attemptId && !isSubmitted && env.apiUrl) {
        navigator.sendBeacon(
          `${env.apiUrl}/examattempts/${attemptId}/progress`,
          JSON.stringify({
            answers,
            currentIndex: currentQuestionIndex,
            markedQuestions: Array.from(markedForReview),
          }),
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [attemptId, isSubmitted, answers, currentQuestionIndex, markedForReview]);

  const currentQuestion = questions[currentQuestionIndex];
  const totalQuestions = isViewOnly
    ? (resultData?.questions?.length ?? 0)
    : questions.length;
  const answeredCount = Object.keys(answers).length;
  const progressPercentage = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formatTimeLabel = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const getRemainingTime = () => {
    if (!timeLimitMinutes) return null;
    const remaining = timeLimitMinutes * 60 - timeSpentSeconds;
    return Math.max(0, remaining);
  };

  const handleAnswerSelect = (answer: string) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: answer,
    }));
  };

  const handleMarkForReview = () => {
    if (!currentQuestion) return;
    setMarkedForReview((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(currentQuestion.id)) {
        newSet.delete(currentQuestion.id);
      } else {
        newSet.add(currentQuestion.id);
      }
      return newSet;
    });
  };

  const doSubmit = async () => {
    if (!attemptId || tokenMap.size === 0) return;

    try {
      await saveProgress(answers);
      const result = await submitSecureQuiz(attemptId, answers, tokenMap);
      setResultData({
        score: result.score,
        totalQuestions: result.totalQuestions,
        correctAnswers: result.correctAnswers,
        percentage: result.percentage,
        showAnswers: result.showAnswers,
        passed: result.passed,
        passingScore: result.passingScore,
        violationCount: cheatingDetection.totalViolations,
        questions: result.questions,
      });
      setIsSubmitted(true);
      setShowSubmitConfirm(false);
      toast.success("Nộp bài thành công!");
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || "Nộp bài thất bại";
      toast.error(message);
    }
  };

  const handleExit = () => {
    navigate(`/exam-session/${examSessionId}`);
  };

  if (initializing || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Đang kiểm tra đăng nhập...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Đang tải bài thi...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Không thể tải bài thi</h1>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => navigate(`/exam-session/${examSessionId}`)}>Quay lại</Button>
        </div>
      </div>
    );
  }

  if (totalQuestions === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <XCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Không có câu hỏi</h1>
          <p className="text-muted-foreground mb-4">Bài thi này chưa có câu hỏi nào</p>
          <Button onClick={handleExit}>Quay lại</Button>
        </div>
      </div>
    );
  }

  if (isSubmitted && resultData) {
    const correctAnswersCount = resultData.correctAnswers;
    const percentage = resultData.percentage;
    const passed = resultData.passed;

    if (showDetailedResults && resultData.showAnswers && resultData.questions) {
      const reviewQuestion = resultData.questions[reviewQuestionIndex];
      const userAnswer = reviewQuestion.userAnswer;
      const correctIdx = resolveAnswerIndex(reviewQuestion.answer || "A", reviewQuestion.options);
      const correctLetter = String.fromCharCode(65 + correctIdx);
      const isCorrect = userAnswer === correctLetter;

      return (
        <div className="flex flex-col min-h-screen">
          {/* Header — same structure as quiz mode header */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
            <div className="container max-w-7xl mx-auto px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => setShowDetailedResults(false)} className="!p-2">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div>
                    <h1 className="text-base font-semibold">Xem lại kết quả</h1>
                    <p className="text-xs text-muted-foreground">Câu {reviewQuestionIndex + 1} / {totalQuestions}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Score count — mirrors answered-count pill from quiz mode */}
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-4 h-4 rounded bg-success" />
                    <span className="text-muted-foreground">{correctAnswersCount}/{totalQuestions}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 container max-w-7xl mx-auto px-4 py-6">
            {/* Progress bar — mirrors quiz mode, shows % correct */}
            <div className="mb-4">
              <Progress value={percentage} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <Card className={cn("border-2", isCorrect ? "border-success" : "border-destructive")}>
                  <CardContent className="pt-6">
                    <div className="mb-4 flex justify-between items-start">
                      <h2 className="text-lg font-semibold">
                        Câu {reviewQuestionIndex + 1}/{totalQuestions}
                      </h2>
                    </div>

                    <StandardMarkdownRenderer content={reviewQuestion.question} className="mb-6" fontSize={16} />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {reviewQuestion.options.map((option, index) => {
                        const optionLetter = String.fromCharCode(65 + index);
                        const isUserAnswer = userAnswer === optionLetter;
                        const isCorrectAnswer = correctLetter === optionLetter;

                        const state: "correct" | "wrong" | "skipped" = isCorrectAnswer ? "correct" : isUserAnswer ? "wrong" : "skipped";

                        return (
                          <QuizOptionRow
                            key={index}
                            optionLetter={optionLetter}
                            state={state}
                            content={<StandardMarkdownRenderer content={option} fontSize={13} />}
                          />
                        );
                      })}
                    </div>

                    {!userAnswer && (
                      <div className="mt-4 p-3 bg-warning/10 border border-warning/30 rounded-lg">
                        <p className="text-warning text-sm">Bạn không trả lời câu hỏi này</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-1">
                <Card className="sticky !p-0">
                  <CardContent className="pt-6 !pb-0 !px-0 flex flex-col" style={{ maxHeight: "calc(100vh - 24rem)" }}>
                    <h3 className="font-semibold mb-4 flex items-center px-4">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Danh sách câu hỏi
                    </h3>

                    <div className="grid grid-cols-5 gap-2 overflow-y-auto flex-1 min-h-0 p-1 px-3">
                      {resultData.questions.map((q, index) => {
                        const qUserAnswer = q.userAnswer;
                        const qIsCorrect = qUserAnswer === q.answer;
                        const isCurrent = index === reviewQuestionIndex;

                        return (
                          <button
                            key={q.id}
                            onClick={() => setReviewQuestionIndex(index)}
                            className={cn(
                              "aspect-square rounded-md text-sm font-medium transition-colors",
                              isCurrent && "ring-2 ring-primary ring-offset-2",
                              qIsCorrect && "bg-success text-white",
                              !qIsCorrect && qUserAnswer && "bg-destructive text-white",
                              !qUserAnswer && "bg-muted text-muted-foreground",
                            )}
                          >
                            {index + 1}
                          </button>
                        );
                      })}
                    </div>

                    <div className="pt-4 mt-2 border-t space-y-2 text-sm shrink-0 bg-background !p-3 !rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-success rounded" />
                        <span className="text-muted-foreground">Đúng</span>
                        <span className="ml-auto font-semibold">{correctAnswersCount}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-destructive rounded" />
                        <span className="text-muted-foreground">Sai</span>
                        <span className="ml-auto font-semibold">{resultData.questions.filter((q) => q.userAnswer && q.userAnswer !== q.answer).length}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-muted rounded border" />
                        <span className="text-muted-foreground">Chưa trả lời</span>
                        <span className="ml-auto font-semibold">{resultData.questions.filter((q) => !q.userAnswer).length}</span>
                      </div>
                    </div>

                    <Button className="w-full !mt-3 mx-3 !py-2" size="lg" onClick={() => setShowDetailedResults(false)} variant="outline">
                      Xem tổng quan
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 z-10 bg-background/95 backdrop-blur border-t border-border">
            <div className="container max-w-7xl mx-auto px-4 py-3">
              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => setReviewQuestionIndex((prev) => prev - 1)} disabled={reviewQuestionIndex === 0}>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Câu trước
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setReviewQuestionIndex((prev) => prev + 1)}
                  disabled={reviewQuestionIndex === totalQuestions - 1}
                >
                  Câu sau
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                {passed ? <CheckCircle2 className="h-20 w-20 text-success" /> : <XCircle className="h-20 w-20 text-destructive" />}
              </div>

              <div>
                <h1 className="text-3xl font-bold mb-2">{passed ? "Chúc mừng!" : "Chưa đạt"}</h1>
                <p className="text-muted-foreground">{passed ? "Bạn đã hoàn thành bài thi" : "Hãy cố gắng hơn lần sau"}</p>
              </div>

              <div className="grid grid-cols-5 gap-4 max-w-2xl mx-auto">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-success">{correctAnswersCount}</div>
                  <div className="text-sm text-muted-foreground">Đúng</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-destructive">{totalQuestions - correctAnswersCount}</div>
                  <div className="text-sm text-muted-foreground">Sai</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{percentage.toFixed(0)}%</div>
                  <div className="text-sm text-muted-foreground">Điểm</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{formatTimeLabel(timeSpentSeconds)}</div>
                  <div className="text-sm text-muted-foreground">Thời gian</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className={`text-2xl font-bold ${(resultData.violationCount ?? 0) > 0 ? "text-warning" : "text-success"}`}>
                    {resultData.violationCount ?? 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Vi phạm</div>
                </div>
              </div>

              <div className="flex gap-4 justify-center flex-wrap">
                {resultData.showAnswers && resultData.questions && (
                  <Button onClick={() => { setShowDetailedResults(true); setReviewQuestionIndex(0); }} variant="default">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Xem chi tiết
                  </Button>
                )}
                <Button onClick={() => navigate(`/exam-session/${examSessionId}/quiz`)} variant="outline">
                  Làm lại
                </Button>
                <Button onClick={handleExit} variant="outline">
                  Thoát
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const remainingTime = getRemainingTime();

  return (
    <>
      <ConfirmDialog
        open={showSubmitConfirm}
        onOpenChange={setShowSubmitConfirm}
        title="Xác nhận nộp bài"
        description={`Bạn mới trả lời ${answeredCount}/${totalQuestions} câu hỏi. Bạn có chắc muốn nộp bài?`}
        confirmText="Nộp bài"
        cancelText="Tiếp tục làm"
        onConfirm={doSubmit}
      />

      <CheatingWarningModal
        open={cheatingDetection.isWarningVisible}
        onClose={cheatingDetection.dismissWarning}
        violationType={cheatingDetection.lastViolationType}
        totalViolations={cheatingDetection.totalViolations}
      />

      <div className="flex flex-col min-h-screen">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
          <div className="container max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={handleExit} className="!p-2">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div>
                  <h1 className="text-base font-semibold">Bài thi</h1>
                  <p className="text-xs text-muted-foreground">Câu {currentQuestionIndex + 1} / {totalQuestions}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-4 h-4 rounded bg-primary" />
                  <span className="text-muted-foreground">{answeredCount}/{totalQuestions}</span>
                </div>
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-sm",
                    remainingTime !== null && remainingTime <= 60 ? "bg-destructive/10 text-destructive animate-pulse" : "bg-muted",
                  )}
                >
                  <Clock className="h-4 w-4" />
                  {remainingTime !== null ? (
                    <span>
                      {formatTimeLabel(remainingTime)}
                      <span className="text-xs text-muted-foreground ml-1">còn lại</span>
                    </span>
                  ) : (
                    <span>{formatTimeLabel(timeSpentSeconds)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 container max-w-7xl mx-auto px-4 py-6">
          <div className="mb-4">
            <Progress value={progressPercentage} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {currentQuestion && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="mb-4 flex justify-between items-start">
                      <h2 className="text-lg font-semibold">
                        Câu {currentQuestionIndex + 1}/{totalQuestions}
                      </h2>
                      <Button
                        variant={markedForReview.has(currentQuestion.id) ? "default" : "outline"}
                        size="sm"
                        className="!p-4"
                        onClick={handleMarkForReview}
                      >
                        <Flag className="h-4 w-4 mr-2" />
                        {markedForReview.has(currentQuestion.id) ? "Đã đánh dấu" : "Đánh dấu"}
                      </Button>
                    </div>

                    <StandardMarkdownRenderer content={currentQuestion.question} className="mb-6" fontSize={16} />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {currentQuestion.options.map((option, index) => {
                        const optionLetter = String.fromCharCode(65 + index);
                        const isSelected = answers[currentQuestion.id] === optionLetter;

                        return (
                          <QuizOptionRow
                            key={index}
                            optionLetter={optionLetter}
                            state={isSelected ? "selected" : "default"}
                            onClick={() => handleAnswerSelect(isSelected ? "" : optionLetter)}
                            content={<StandardMarkdownRenderer content={option} fontSize={13} />}
                          />
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="lg:col-span-1">
              <Card className="sticky !p-0">
                <CardContent className="pt-6 !pb-0 !px-0 flex flex-col" style={{ maxHeight: "calc(100vh - 24rem)" }}>
                  <h3 className="font-semibold mb-4 flex items-center">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Danh sách câu hỏi
                  </h3>

                  <div className="grid grid-cols-5 gap-2 overflow-y-auto flex-1 min-h-0 p-1">
                    {questions.map((q, index) => {
                      const isAnswered = !!answers[q.id];
                      const isMarked = markedForReview.has(q.id);
                      const isCurrent = index === currentQuestionIndex;

                      return (
                        <button
                          key={q.id}
                          onClick={() => setCurrentQuestionIndex(index)}
                          className={cn(
                            "aspect-square rounded-md text-sm font-medium transition-colors relative",
                            isCurrent && "ring-2 ring-primary ring-offset-2",
                            isAnswered && !isCurrent && "bg-primary text-primary-foreground",
                            !isAnswered && !isCurrent && "bg-muted hover:bg-muted/80",
                          )}
                        >
                          {index + 1}
                          {isMarked && <Flag className="h-3 w-3 absolute top-1 right-1 size-8" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-4 mt-2 border-t space-y-2 text-sm shrink-0 bg-background !p-2 !rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-primary rounded" />
                      <span className="text-muted-foreground">Đã trả lời</span>
                      <span className="ml-auto font-semibold">{answeredCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-muted rounded" />
                      <span className="text-muted-foreground">Chưa trả lời</span>
                      <span className="ml-auto font-semibold">{totalQuestions - answeredCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 text-warning" />
                      <span className="text-muted-foreground">Đánh dấu</span>
                      <span className="ml-auto font-semibold">{markedForReview.size}</span>
                    </div>
                  </div>

                  {remainingTime !== null && remainingTime <= 300 && remainingTime > 0 && (
                    <div className="mt-3 p-3 bg-warning/10 border border-warning/30 rounded-lg shrink-0">
                      <div className="flex items-center gap-2 text-warning text-sm">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Còn {Math.ceil(remainingTime / 60)} phút</span>
                      </div>
                    </div>
                  )}

                  <Button className="w-full !mt-3" size="lg" onClick={() => setShowSubmitConfirm(true)} variant="default">
                    Nộp bài
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 bg-background/95 backdrop-blur border-t border-border">
          <div className="container max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setCurrentQuestionIndex((prev) => prev - 1)} disabled={currentQuestionIndex === 0}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Câu trước
              </Button>

              <div className="flex items-center gap-2">
                {currentQuestionIndex === totalQuestions - 1 ? (
                  <Button onClick={() => (answeredCount < totalQuestions ? setShowSubmitConfirm(true) : doSubmit())}>
                    Nộp bài
                  </Button>
                ) : (
                  <Button onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}>
                    Câu sau
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
