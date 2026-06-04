import { AlertCircle, Calendar, History, Pin, PinOff, PlayCircle, Trophy } from "lucide-react"
import { Button } from "@/components/antd/button"
import { cn } from "@/lib/utils"
import type { SessionSummary } from "../my-exams-types"

function getScoreColor(score: number): string {
  if (score >= 80) return "text-success"
  if (score >= 50) return "text-accent-amber"
  return "text-error"
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return "Vừa xong"
  if (diffMins < 60) return `${diffMins} phút trước`
  if (diffHours < 24) return `${diffHours} giờ trước`
  if (diffDays < 7) return `${diffDays} ngày trước`
  return date.toLocaleDateString("vi-VN")
}

export function SessionCard({
  session,
  onViewHistory,
  onTogglePin,
}: {
  session: SessionSummary
  onViewHistory: (s: SessionSummary) => void
  onTogglePin: (s: SessionSummary) => void
}) {
  return (
    <article className="group relative flex h-[260px] flex-col rounded-lg border border-hairline bg-canvas p-5 transition-all duration-200 hover:border-coral/30 hover:shadow-[0_4px_16px_rgba(20,20,19,0.06)]">
      {session.isPinned && (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-coral/10 text-coral">
          <Pin className="h-3 w-3" />
        </span>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-card">
            <Trophy className="h-5 w-5 text-accent-amber" />
          </div>
          <div className="min-w-0">
            <h3 className="font-body text-[15px] font-medium leading-snug text-ink line-clamp-2">
              {session.title}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatTimeAgo(session.lastAttemptAt)}
              </span>
              {session.totalViolations > 0 && (
                <span className="flex items-center gap-1 text-error">
                  <AlertCircle className="h-3 w-3" />
                  {session.totalViolations} vi phạm
                </span>
              )}
            </div>
          </div>
        </div>
        {session.hasInProgress ? (
          <div className="inline-flex items-center rounded-pill bg-coral/10 px-2.5 font-medium text-coral w-fit flex items-center gap-x-2">
            <PlayCircle className="h-3 w-3" />
            <p className="whitespace-nowrap text-xs !mt-2.5">Đang làm</p>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1 rounded-pill bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success w-fit flex items-center gap-x-2">
            <p className="whitespace-nowrap text-xs !mt-2.5">{session.attemptCount} lần thi</p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-md bg-surface-soft px-3 py-2 text-center">
          <p className={cn("text-lg font-semibold", session.bestScore !== null ? getScoreColor(session.bestScore) : "text-ink")}>
            {session.bestScore !== null ? session.bestScore.toFixed(1) : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">Điểm cao</p>
        </div>
        <div className="rounded-md bg-surface-soft px-3 py-2 text-center">
          <p className="text-lg font-semibold text-ink">{session.attemptCount}</p>
          <p className="text-[10px] text-muted-foreground">Số lần thi</p>
        </div>
        <div className="rounded-md bg-surface-soft px-3 py-2 text-center">
          <p className="text-lg font-semibold text-ink">{session.bestPercentage}%</p>
          <p className="text-[10px] text-muted-foreground">Tỷ lệ tốt</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="h-1 overflow-hidden rounded-pill bg-hairline">
          <div
            className="h-full rounded-pill bg-coral transition-all duration-300"
            style={{ width: `${session.bestPercentage}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto flex items-center justify-between border-t border-hairline-soft !pt-2 !mt-2">
        <button
          onClick={() => onTogglePin(session)}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-md transition-colors",
            session.isPinned
              ? "bg-coral/10 text-coral hover:bg-coral/20"
              : "text-muted-foreground hover:bg-surface-card hover:text-ink",
          )}
          aria-label={session.isPinned ? "Bỏ ghim" : "Ghim"}
          title={session.isPinned ? "Bỏ ghim" : "Ghim"}
        >
          {session.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
        <div className="flex items-center gap-2">
          {session.hasInProgress && (
            <Button
              onClick={() => {
                const url = session.inProgressAttemptId
                  ? `/exam-session/${session.examSessionId}/quiz?attemptId=${session.inProgressAttemptId}`
                  : `/exam-session/${session.examSessionId}/quiz`
                window.location.assign(url)
              }}
              size="sm"
              className="h-8 px-3 text-xs"
            >
              <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
              Tiếp tục
            </Button>
          )}
          <Button
            onClick={() => onViewHistory(session)}
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs"
          >
            <History className="mr-1.5 h-3.5 w-3.5" />
            Lịch sử
          </Button>
        </div>
      </div>
    </article>
  )
}
