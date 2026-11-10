import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react"
import { getMyAttemptsBySessionApi, type MyAttemptItem } from "@/apis/examAttemptApi"
import { Button } from "@/components/antd/button"
import { Skeleton } from "@/components/antd/skeleton"
import type { SessionSummary } from "../my-exams-types"

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "-"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  return `${m}:${s.toString().padStart(2, "0")}`
}

function AttemptStatusBadge({ status }: { status: number }) {
  if (status === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-coral/10 px-2 py-0.5 text-xs font-medium text-coral">
        <Clock className="h-3 w-3" />
        Đang làm
      </span>
    )
  }
  if (status === 1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
        <CheckCircle className="h-3 w-3" />
        Hoàn thành
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-error/10 px-2 py-0.5 text-xs font-medium text-error">
      <XCircle className="h-3 w-3" />
      Đã hủy
    </span>
  )
}

export function SessionHistoryDialog({ session }: { session: SessionSummary | null }) {
  const navigate = useNavigate()
  const [attempts, setAttempts] = useState<MyAttemptItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const sessionId = session?.examSessionId ?? null
  const showAnswers = session?.showAnswersAfterSubmit ?? false

  useEffect(() => {
    if (!sessionId) {
      setAttempts([])
      setError(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(false)
    getMyAttemptsBySessionApi(sessionId, 1, 50)
      .then((res) => {
        if (!cancelled) {
          // Sort descending by startedAt (most recent first)
          const sorted = [...res.examAttempts].sort(
            (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
          )
          setAttempts(sorted)
        }
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [sessionId])

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <p className="py-8 text-center text-sm text-error">
        Không thể tải lịch sử bài thi. Vui lòng thử lại.
      </p>
    )
  }

  if (attempts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Chưa có lần thi nào.</p>
    )
  }

  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      {attempts.map((attempt, index) => {
        const percentage = attempt.totalQuestions > 0
          ? Math.round((attempt.correctAnswers / attempt.totalQuestions) * 100)
          : 0
        const attemptNumber = attempts.length - index
        const canViewResult = attempt.status === 1 && showAnswers

        return (
          <div
            key={attempt.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-hairline p-4"
          >
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-ink">Lần thi #{attemptNumber}</span>
                <AttemptStatusBadge status={attempt.status} />
                {attempt.violationCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-error">
                    <AlertCircle className="h-3 w-3" />
                    {attempt.violationCount} VP
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(attempt.startedAt).toLocaleString("vi-VN")}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{percentage}%</span>
                <span>{attempt.correctAnswers}/{attempt.totalQuestions} đúng</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(attempt.timeSpentSeconds)}
                </span>
              </div>
            </div>
            {canViewResult && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 px-3 text-xs"
                onClick={() =>
                  navigate(
                    `/exam-session/${sessionId}/quiz?attemptId=${attempt.id}&view=result`,
                  )
                }
              >
                Xem kết quả
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
