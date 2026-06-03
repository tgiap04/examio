import { ExamHeaderSection } from "@/components/organisms/k/ExamHeaderSection";
import { ExamInstructionsSection } from "@/components/organisms/k/ExamInstructionsSection";
import { SystemCheckSection } from "@/components/molecules/SystemCheckSection";
import { CountdownTimer } from "@/components/atoms/k/CountdownTimer";
import { ExamProgressSection } from "@/components/organisms/k/ExamProgressSection";
import { Card } from "@/components/antd/card";
import { Checkbox } from "@/components/antd/checkbox";
import { Button } from "@/components/antd/button";
import { Skeleton } from "@/components/antd/skeleton";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCcw,
  Loader2,
  Award,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ExamInfo {
  title: string;
  subtitle: string;
  duration: number;
  totalQuestions: number;
  passingScore: number;
  attempts: string;
}

interface ExamProgress {
  answered: number;
  total: number;
  marked: number;
}

interface TimeRemaining {
  hours: number;
  minutes: number;
  seconds: number;
}

interface MyAttemptItem {
  id: string;
  status: number;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  startedAt: string;
  finishedAt: string | null;
  violationCount: number;
  timeSpentSeconds: number | null;
}

interface ExamRoomDetailTemplateProps {
  examInfo: ExamInfo;
  progress: ExamProgress;
  timeRemaining?: TimeRemaining | null;
  examStartTime: string;
  onStartExam: () => void;
  myAttempts?: MyAttemptItem[];
  myAttemptsLoading?: boolean;
  onContinueAttempt?: (attemptId: string) => void;
  onViewAttempt?: (attemptId: string) => void;
}

export function ExamRoomDetailTemplate({
  examInfo,
  progress,
  timeRemaining,
  examStartTime,
  onStartExam,
  myAttempts = [],
  myAttemptsLoading = false,
  onContinueAttempt,
  onViewAttempt,
}: ExamRoomDetailTemplateProps) {
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return "-";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("vi-VN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: number, score: number, passingScore: number) => {
    if (status === 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
          <Loader2 className="h-3 w-3" />
          Đang thi
        </span>
      );
    }
    if (score >= passingScore) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <CheckCircle2 className="h-3 w-3" />
          Đạt
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <XCircle className="h-3 w-3" />
        Chưa đạt
      </span>
    );
  };

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content - Left Side (2 columns) */}
          <div className="!space-y-3 lg:col-span-2">
            {/* Exam Header */}
            <ExamHeaderSection examInfo={examInfo} />

            {/* Exam Instructions */}
            <ExamInstructionsSection />

            {/* System Check */}
            <SystemCheckSection />

            {/* Terms Agreement */}
            <Card className="p-6">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) =>
                    setAgreedToTerms(checked === true)
                  }
                />
                <label
                  htmlFor="terms"
                  className="flex-1 cursor-pointer text-sm leading-relaxed text-foreground">
                  Tôi xác nhận đã đọc và hiểu các hướng dẫn thi. Tôi đồng ý tuân
                  thủ tất cả các chính sách học thuật và hiểu rằng mọi hành vi
                  gian lận hoặc hỗ trợ trái phép sẽ dẫn đến việc bị loại ngay
                  lập tức.
                </label>
              </div>
            </Card>

            {/* Exam Start Info & Button */}
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span>Bài thi bắt đầu: {examStartTime}</span>
                </div>
                <Button
                  size="lg"
                  disabled={!agreedToTerms}
                  onClick={onStartExam}
                  className="bg-gradient-to-r from-primary to-purple-500 hover:opacity-90">
                  Bắt đầu làm bài
                </Button>
              </div>
            </Card>
          </div>

          {/* Sidebar - Right Side (1 column) */}
          <div className="space-y-6 lg:col-span-1">
            {/* Countdown Timer - only show if timeRemaining exists */}
            {timeRemaining && (
              <Card className="p-6">
                <CountdownTimer
                  hours={timeRemaining.hours}
                  minutes={timeRemaining.minutes}
                  seconds={timeRemaining.seconds}
                  label="Thời gian còn lại"
                  description="Bài thi sẽ tự động nộp khi hết thời gian"
                />
              </Card>
            )}

            {/* Exam Progress */}
            <ExamProgressSection progress={progress} />

            {/* Attempt History */}
            <Card className="p-6">
              <h3 className="mb-4 font-semibold text-foreground flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Lịch sử làm bài
              </h3>

              {myAttemptsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : myAttempts.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <Award className="h-10 w-10 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">Chưa có lượt thi nào</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Bắt đầu lần đầu tiên của bạn</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myAttempts.map((attempt, index) => {
                    const percentage = attempt.totalQuestions > 0
                      ? Math.round((attempt.correctAnswers / attempt.totalQuestions) * 100)
                      : 0;
                    const passed = percentage >= examInfo.passingScore;

                    return (
                      <div
                        key={attempt.id}
                        className="flex items-start gap-3 p-4 rounded-[12px] border border-border hover:border-hairline transition-colors"
                      >
                        {/* Status icon */}
                        <div className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg mt-0.5",
                          attempt.status === 0
                            ? "bg-yellow-100 text-yellow-600"
                            : passed
                              ? "bg-green-100 text-green-600"
                              : "bg-red-100 text-red-600",
                        )}>
                          {attempt.status === 0 ? (
                            <Loader2 className="h-5 w-5" />
                          ) : passed ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : (
                            <XCircle className="h-5 w-5" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-sm font-semibold">Lần {index + 1}</span>
                            {getStatusBadge(attempt.status, percentage, examInfo.passingScore)}
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{formatDate(attempt.startedAt)}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{percentage}%</span>
                            <span>{attempt.correctAnswers}/{attempt.totalQuestions} đúng</span>
                            {attempt.timeSpentSeconds !== null && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDuration(attempt.timeSpentSeconds)}
                              </span>
                            )}
                            {attempt.violationCount > 0 && (
                              <span className="flex items-center gap-0.5 text-orange-500">
                                <AlertCircle className="h-3 w-3" />
                                {attempt.violationCount} VP
                              </span>
                            )}
                          </div>

                          {/* Action button */}
                          {attempt.status === 0 ? (
                            onContinueAttempt && (
                              <Button
                                size="sm"
                                className="mt-3 w-full"
                                onClick={() => onContinueAttempt(attempt.id)}
                              >
                                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                                Tiếp tục làm bài
                              </Button>
                            )
                          ) : (
                            onViewAttempt && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-3 w-full"
                                onClick={() => onViewAttempt(attempt.id)}
                              >
                                Xem chi tiết
                              </Button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
