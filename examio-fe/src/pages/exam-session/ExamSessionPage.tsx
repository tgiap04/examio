import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  checkExamSessionAccessApi,
  verifyExamSessionAccessCodeApi,
  getExamSessionStatsApi,
  type ExamSessionStats,
} from "@/apis/examSessionApi";
import { getMyAttemptsBySessionApi, type MyAttemptItem } from "@/apis/examAttemptApi";
import { EXAM_SESSION_STATUS, type AccessCheckResult } from "@/types/examSession";
import { ExamRoomDetailTemplate } from "@/templates/ExamRoomDetailTemplate";
import { Skeleton } from "@/components/antd/skeleton";
import { Button } from "@/components/antd/button";
import { Card, CardContent } from "@/components/antd/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/antd/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/antd/input-otp";
import { KeyRound, Loader2, Lock, XCircle } from "lucide-react";
import { toast } from "@/components/antd/toast";
import { cn } from "@/lib/utils";
import { setRedirectBackTarget } from "@/lib/authRedirect";
import { useAuthStore } from "@/stores/useAuthStore";
import { useCan } from "@/hooks/useCan";
import { canLoadExamStats } from "@/lib/rbac/exam-stats-gate";
import { useTranslation } from "react-i18next";
import { useStudentMaterialsStore } from "@/stores/useStudentMaterialsStore";

export default function ExamSessionPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, initializing } = useAuthStore();
  const canTakeExam = useCan("exam:take");
  const { t } = useTranslation("common");
  const { invalidateExams } = useStudentMaterialsStore();

  const [loading, setLoading] = useState(true);
  const [accessInfo, setAccessInfo] = useState<AccessCheckResult | null>(null);
  const [stats, setStats] = useState<ExamSessionStats | null>(null);
  const [sessionNotFound, setSessionNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCodeDialog, setShowCodeDialog] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [myAttempts, setMyAttempts] = useState<MyAttemptItem[]>([]);
  const [myAttemptsLoading, setMyAttemptsLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      if (initializing) {
        return;
      }

      if (!isAuthenticated) {
        const returnTo = `${location.pathname}${location.search}${location.hash}`;
        setRedirectBackTarget(returnTo);
        navigate(`/login?from=${encodeURIComponent(returnTo)}`, { replace: true });
        return;
      }

      setLoading(true);
      setLoadError(null);
      try {
        const access = await checkExamSessionAccessApi(id);
        setAccessInfo(access);

        if (canLoadExamStats(access.hasAccess, canTakeExam)) {
          const sessionStats = await getExamSessionStatsApi(id);
          setStats(sessionStats);

          // Load user's attempt history for this session
          setMyAttemptsLoading(true);
          try {
            const attemptRes = await getMyAttemptsBySessionApi(id, 1, 10);
            setMyAttempts(attemptRes.examAttempts);
          } catch {
            // silently ignore
          } finally {
            setMyAttemptsLoading(false);
          }
        } else if (access.accessType === "code_required") {
          setShowCodeDialog(true);
        }
      } catch (error: any) {
        console.error("Error loading exam session:", error);
        if (error?.response?.status === 404) {
          setSessionNotFound(true);
        } else {
          const message =
            error?.response?.data?.message ||
            error?.message ||
            "Không thể tải thông tin phiên thi";
          setLoadError(message);
          toast.error(message);
        }
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadData();
    }
  }, [id, initializing, isAuthenticated, canTakeExam, location.key, navigate]);

  const handleVerifyCode = async () => {
    if (accessCode.length !== 6) {
      setCodeError("Mã truy cập phải có 6 chữ số");
      return;
    }

    setVerifying(true);
    setCodeError("");

    try {
      await verifyExamSessionAccessCodeApi(id, accessCode);
      if (canLoadExamStats(true, canTakeExam)) {
        const sessionStats = await getExamSessionStatsApi(id);
        setStats(sessionStats);
      }
      setAccessInfo({ hasAccess: true, accessType: "whitelist" });
      // Persist the verified code so the server can re-check access when the
      // attempt is actually started (start endpoint enforces access — C3).
      sessionStorage.setItem(`examio:exam-code:${id}`, accessCode);
      setShowCodeDialog(false);
      toast.success("Xác thực thành công!");
    } catch {
      setCodeError("Mã truy cập không đúng");
    } finally {
      setVerifying(false);
    }
  };

  const handleGoHome = () => {
    navigate("/");
  };

  if (loading) {
    return (
      <div className="bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-60 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
            <div className="space-y-6 lg:col-span-1">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sessionNotFound) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <XCircle className="h-16 w-16 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Không tìm thấy phiên thi</h2>
            <p className="text-muted-foreground mb-4">
              Phiên thi này có thể đã bị xóa hoặc không tồn tại.
            </p>
            <Button variant="outline" onClick={handleGoHome}>
              Về trang chủ
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showCodeDialog) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 bg-background">
        <Dialog open={true} onOpenChange={() => {}}>
          <DialogContent
            className="sm:max-w-md"
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
            showCloseButton={false}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Nhập mã truy cập
              </DialogTitle>
              <DialogDescription>
                Phiên thi này yêu cầu mã truy cập để tham gia
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={accessCode}
                    onChange={(value) => {
                      setAccessCode(value);
                      setCodeError("");
                    }}
                    disabled={verifying}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} className={cn("h-12 w-12 text-lg", codeError && "border-red-500")} />
                      <InputOTPSlot index={1} className={cn("h-12 w-12 text-lg", codeError && "border-red-500")} />
                      <InputOTPSlot index={2} className={cn("h-12 w-12 text-lg", codeError && "border-red-500")} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} className={cn("h-12 w-12 text-lg", codeError && "border-red-500")} />
                      <InputOTPSlot index={4} className={cn("h-12 w-12 text-lg", codeError && "border-red-500")} />
                      <InputOTPSlot index={5} className={cn("h-12 w-12 text-lg", codeError && "border-red-500")} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {codeError && <p className="text-sm text-red-500 text-center">{codeError}</p>}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleGoHome} disabled={verifying}>
                  Quay lại
                </Button>
                <Button className="flex-1" onClick={handleVerifyCode} disabled={verifying || accessCode.length !== 6}>
                  {verifying ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Đang xác thực...
                    </>
                  ) : (
                    "Xác nhận"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (accessInfo && !accessInfo.hasAccess && accessInfo.accessType === "denied") {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Lock className="h-16 w-16 text-orange-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Phiên thi riêng tư</h2>
            <p className="text-muted-foreground mb-6">Bạn không có quyền truy cập phiên thi này.</p>
            <Button onClick={handleGoHome}>Về trang chủ</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stats && loadError) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <XCircle className="h-16 w-16 text-red-500 mb-4" />
            <p className="text-muted-foreground mb-4">{loadError}</p>
            <Button variant="outline" onClick={handleGoHome}>
              Về trang chủ
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stats && accessInfo?.hasAccess && !canTakeExam) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div
          role="status"
          className="max-w-md rounded-lg border border-hairline bg-surface-soft px-4 py-3 text-center text-sm text-ink"
        >
          {t("rbac.teacherCannotTakeExam")}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const formatAttempts = (): string => {
    if (stats.maxAttempts === null) {
      return stats.currentAttempt === 0 ? "Lần đầu" : `Lần ${stats.currentAttempt}`;
    }

    const nextAttempt = stats.currentAttempt + 1;
    return `${nextAttempt}/${stats.maxAttempts}`;
  };

  const formatDuration = (): number | string => {
    if (stats.durationMinutes === null) {
      return "Không giới hạn";
    }
    return stats.durationMinutes;
  };

  const formatPassingScore = (): number | string => {
    if (stats.passingScore === 0) {
      return "Không có";
    }
    return stats.passingScore;
  };

  const examInfo = {
    title: stats.title,
    subtitle: stats.description || "Thi trực tuyến",
    duration: typeof formatDuration() === "number" ? (formatDuration() as number) : 0,
    totalQuestions: stats.totalQuestions,
    passingScore: typeof formatPassingScore() === "number" ? (formatPassingScore() as number) : 0,
    attempts: formatAttempts(),
  };

  const calculateTimeRemaining = () => {
    if (!stats.endTime) {
      return null;
    }

    if (stats.status === EXAM_SESSION_STATUS.UPCOMING) {
      const startTime = new Date(stats.startTime);
      const now = new Date();
      const diff = startTime.getTime() - now.getTime();

      if (diff > 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        return { hours, minutes, seconds };
      }
    }

    if (stats.status === EXAM_SESSION_STATUS.ONGOING && stats.endTime) {
      const endTime = new Date(stats.endTime);
      const now = new Date();
      const diff = endTime.getTime() - now.getTime();

      if (diff > 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        return { hours, minutes, seconds };
      }
    }

    return null;
  };

  const examStartTime = new Date(stats.startTime).toLocaleDateString("vi-VN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleStartExam = () => {
    if (!canTakeExam) {
      toast.info(t("rbac.teacherCannotTakeExam"));
      return;
    }
    if (stats.startTime > new Date().toISOString()) {
      toast.info("Phiên thi chưa bắt đầu. Vui lòng quay lại đúng giờ.");
      return;
    }
    if (stats.endTime && stats.endTime < new Date().toISOString()) {
      toast.info("Phiên thi đã kết thúc.");
      return;
    }
    // Clear /k/my-exams cache so the new attempt appears immediately when user returns
    invalidateExams();
    navigate(`/exam-session/${id}/quiz`);
  };

  const handleContinueAttempt = (attemptId: string) => {
    invalidateExams();
    navigate(`/exam-session/${id}/quiz?attemptId=${attemptId}`);
  };

  const handleViewAttempt = (attemptId: string) => {
    navigate(`/exam-session/${id}/quiz?attemptId=${attemptId}&view=result`);
  };

  return (
    <>
      {!canTakeExam && (
        <div
          role="status"
          className="mx-auto mt-4 max-w-4xl rounded-lg border border-hairline bg-surface-soft px-4 py-3 text-sm text-ink"
        >
          {t("rbac.teacherCannotTakeExam")}
        </div>
      )}
      <ExamRoomDetailTemplate
        examInfo={examInfo}
        progress={stats.progress}
        timeRemaining={calculateTimeRemaining()}
        examStartTime={examStartTime}
        onStartExam={handleStartExam}
        myAttempts={myAttempts}
        myAttemptsLoading={myAttemptsLoading}
        onContinueAttempt={handleContinueAttempt}
        onViewAttempt={handleViewAttempt}
      />
    </>
  );
}
