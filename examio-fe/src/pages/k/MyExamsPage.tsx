import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Pin,
  PinOff,
  PlayCircle,
  Trophy,
  TrendingUp,
  XCircle,
} from "lucide-react"
import { type RecentExamAttempt, togglePinExamRoomApi } from "@/apis/studentMaterialsApi"
import { Button } from "@/components/antd/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/antd/dialog"
import { Skeleton } from "@/components/antd/skeleton"
import { useToast } from "@/components/antd/toast"
import { useStudentMaterialsStore } from "@/stores/useStudentMaterialsStore"

const PAGE_SIZE = 12

function sortWithPinnedFirst(items: RecentExamAttempt[]): RecentExamAttempt[] {
  const pinned = items.filter((m) => m.isPinned)
  const unpinned = items.filter((m) => !m.isPinned)
  return [...pinned, ...unpinned]
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

function StatusBadge({ status }: { status: number }) {
  switch (status) {
    case 0:
      return (
        <span className="inline-flex items-center gap-1 rounded-pill bg-coral/10 px-2.5 py-0.5 text-xs font-medium text-coral">
          <Clock className="h-3 w-3" />
          Đang làm
        </span>
      )
    case 1:
      return (
        <span className="inline-flex items-center gap-1 rounded-pill bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
          <CheckCircle className="h-3 w-3" />
          Hoàn thành
        </span>
      )
    case 2:
      return (
        <span className="inline-flex items-center gap-1 rounded-pill bg-error/10 px-2.5 py-0.5 text-xs font-medium text-error">
          <XCircle className="h-3 w-3" />
          Đã hủy
        </span>
      )
    default:
      return null
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-success"
  if (score >= 50) return "text-accent-amber"
  return "text-error"
}

function ExamCard({
  attempt,
  onViewDetail,
  onTogglePin,
}: {
  attempt: RecentExamAttempt
  onViewDetail: (attempt: RecentExamAttempt) => void
  onTogglePin: (attempt: RecentExamAttempt) => void
}) {
  const title = attempt.examSession.examRoom.title
  const percentage = attempt.totalQuestions > 0
    ? Math.round((attempt.correctAnswers / attempt.totalQuestions) * 100)
    : 0

  return (
    <article className="group relative flex h-[240px] flex-col rounded-lg border border-hairline bg-canvas p-5 transition-all duration-200 hover:border-coral/30 hover:shadow-[0_4px_16px_rgba(20,20,19,0.06)]">
      {attempt.isPinned && (
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
              {title}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatTimeAgo(attempt.startedAt)}
              </span>
              {attempt.violationCount > 0 && (
                <span className="flex items-center gap-1 text-error">
                  <AlertCircle className="h-3 w-3" />
                  {attempt.violationCount} vi phạm
                </span>
              )}
            </div>
          </div>
        </div>
        <StatusBadge status={attempt.status} />
      </div>

      {/* Score stats */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-md bg-surface-soft px-3 py-2 text-center">
          <p className={`text-lg font-semibold ${attempt.score !== null ? getScoreColor(attempt.score) : "text-ink"}`}>
            {attempt.score !== null ? attempt.score.toFixed(1) : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">Điểm</p>
        </div>
        <div className="rounded-md bg-surface-soft px-3 py-2 text-center">
          <p className="text-lg font-semibold text-ink">
            {attempt.correctAnswers}/{attempt.totalQuestions}
          </p>
          <p className="text-[10px] text-muted-foreground">Đúng</p>
        </div>
        <div className="rounded-md bg-surface-soft px-3 py-2 text-center">
          <p className="text-lg font-semibold text-ink">{percentage}%</p>
          <p className="text-[10px] text-muted-foreground">Tỷ lệ</p>
        </div>
      </div>

      {/* Progress bar */}
      {attempt.status === 1 && (
        <div className="mt-3">
          <div className="h-1 overflow-hidden rounded-pill bg-hairline">
            <div
              className="h-full rounded-pill bg-coral transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto flex items-center justify-between border-t border-hairline-soft pt-4">
        <button
          onClick={() => onTogglePin(attempt)}
          className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${attempt.isPinned
              ? "bg-coral/10 text-coral hover:bg-coral/20"
              : "text-muted-foreground hover:bg-surface-card hover:text-ink"
            }`}
          aria-label={attempt.isPinned ? "Bỏ ghim" : "Ghim"}
          title={attempt.isPinned ? "Bỏ ghim" : "Ghim"}
        >
          {attempt.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
        {attempt.status === 0 ? (
          <Button
            onClick={() => window.location.assign(`/exam-session/${attempt.examSessionId}/quiz`)}
            size="sm"
            className="h-8 px-3 text-xs"
          >
            <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
            Tiếp tục
          </Button>
        ) : (
          <Button
            onClick={() => onViewDetail(attempt)}
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs"
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Chi tiết
          </Button>
        )}
      </div>
    </article>
  )
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  if (totalPages <= 1) return null

  const getVisiblePages = () => {
    const pages: (number | "ellipsis")[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (page > 3) pages.push("ellipsis")
      const start = Math.max(2, page - 1)
      const end = Math.min(totalPages - 1, page + 1)
      for (let i = start; i <= end; i++) pages.push(i)
      if (page < totalPages - 2) pages.push("ellipsis")
      pages.push(totalPages)
    }
    return pages
  }

  return (
    <nav className="mt-8 flex items-center justify-center gap-1" aria-label="Phân trang">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="grid h-9 w-9 place-items-center rounded-md border border-hairline text-muted-foreground transition-colors hover:bg-surface-card hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        aria-label="Trang trước"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {getVisiblePages().map((p, i) =>
        p === "ellipsis" ? (
          <span key={`ellipsis-${i}`} className="grid h-9 w-9 place-items-center text-xs text-muted-foreground">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`grid h-9 w-9 place-items-center rounded-md text-sm font-medium transition-colors ${p === page
                ? "bg-coral text-on-primary"
                : "border border-hairline text-body hover:bg-surface-card hover:text-ink"
              }`}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="grid h-9 w-9 place-items-center rounded-md border border-hairline text-muted-foreground transition-colors hover:bg-surface-card hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        aria-label="Trang sau"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  )
}

function ExamAttemptDetails({ attempt }: { attempt: RecentExamAttempt }) {
  const percentage = attempt.totalQuestions > 0
    ? (attempt.correctAnswers / attempt.totalQuestions) * 100
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl tracking-tight text-ink">{attempt.examSession.examRoom.title}</h3>
        {attempt.examSession.examRoom.description && (
          <p className="mt-1 text-sm text-muted-foreground">{attempt.examSession.examRoom.description}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-hairline bg-surface-soft p-4 text-center">
          <Trophy className="mx-auto h-6 w-6 text-accent-amber" />
          <p className={`mt-2 text-2xl font-semibold ${getScoreColor(attempt.score)}`}>{attempt.score.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground">Điểm số</p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface-soft p-4 text-center">
          <TrendingUp className="mx-auto h-6 w-6 text-success" />
          <p className="mt-2 text-2xl font-semibold text-ink">{percentage.toFixed(0)}%</p>
          <p className="text-xs text-muted-foreground">Tỷ lệ đúng</p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface-soft p-4 text-center">
          <CheckCircle className="mx-auto h-6 w-6 text-coral" />
          <p className="mt-2 text-2xl font-semibold text-ink">{attempt.correctAnswers}/{attempt.totalQuestions}</p>
          <p className="text-xs text-muted-foreground">Câu đúng</p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface-soft p-4 text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-error" />
          <p className="mt-2 text-2xl font-semibold text-ink">{attempt.violationCount}</p>
          <p className="text-xs text-muted-foreground">Vi phạm</p>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-hairline bg-surface-soft p-4">
        <h4 className="text-sm font-medium text-ink">Thông tin thời gian</h4>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bắt đầu</span>
            <span className="font-medium text-ink">{new Date(attempt.startedAt).toLocaleString("vi-VN")}</span>
          </div>
          {attempt.finishedAt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hoàn thành</span>
              <span className="font-medium text-ink">{new Date(attempt.finishedAt).toLocaleString("vi-VN")}</span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Tiến độ</span>
          <span className="font-medium text-ink">{percentage.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-pill bg-hairline">
          <div
            className="h-full rounded-pill bg-coral transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export default function MyExamsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()
  const { fetchExams: fetchExamsFromStore } = useStudentMaterialsStore()

  const currentPage = Number(searchParams.get("page")) || 1

  const [examAttempts, setExamAttempts] = useState<RecentExamAttempt[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; attempt: RecentExamAttempt | null }>({
    open: false,
    attempt: null,
  })

  const fetchExams = useCallback(async (page: number) => {
    try {
      setLoading(true)
      const data = await fetchExamsFromStore(page, PAGE_SIZE)
      setExamAttempts(sortWithPinnedFirst(data.examAttempts))
      setTotal(data.total)
    } catch {
      toast.error("Không thể tải lịch sử thi")
    } finally {
      setLoading(false)
    }
  }, [fetchExamsFromStore, toast])

  useEffect(() => {
    fetchExams(currentPage)
  }, [currentPage, fetchExams])

  const handlePageChange = (page: number) => {
    setSearchParams({ page: String(page) })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleTogglePin = async (attempt: RecentExamAttempt) => {
    const examRoomId = attempt.examSession.examRoom.id
    const newPinned = !attempt.isPinned
    setExamAttempts((prev) => {
      const updated = prev.map((a) =>
        a.examSession.examRoom.id === examRoomId ? { ...a, isPinned: newPinned } : a
      )
      return sortWithPinnedFirst(updated)
    })

    try {
      await togglePinExamRoomApi(examRoomId)
    } catch {
      setExamAttempts((prev) => {
        const reverted = prev.map((a) =>
          a.examSession.examRoom.id === examRoomId ? { ...a, isPinned: !newPinned } : a
        )
        return sortWithPinnedFirst(reverted)
      })
      toast.error("Không thể ghim phòng thi")
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (loading) {
    return (
      <div className="relative min-h-screen bg-background text-foreground">
        <section className="relative mx-auto max-w-7xl px-4 py-6 md:py-8">
          <div className="space-y-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[220px] rounded-lg" />
            ))}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <section className="relative mx-auto max-w-7xl px-4 py-6 md:py-8 mt-4">
        <header className="mb-8">
          <h1 className="text-3xl tracking-tight text-ink lg:text-4xl">
            Bài thi của tôi
          </h1>
          <p className="mt-2 font-body text-base text-muted-foreground">
            Danh sách các bài thi và luyện tập gần đây
            {total > 0 && (
              <span className="ml-2 text-sm text-muted-foreground">({total} bài)</span>
            )}
          </p>
        </header>

        {examAttempts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-hairline-soft bg-surface-soft py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-card">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="mt-4 font-body text-base font-medium text-ink">
              Chưa có bài thi nào
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Tham gia phòng thi để bắt đầu
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {examAttempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className="transition-all duration-300 ease-out"
                  style={{ order: attempt.isPinned ? 0 : 1 }}
                >
                  <ExamCard
                    attempt={attempt}
                    onViewDetail={(a) => setDetailDialog({ open: true, attempt: a })}
                    onTogglePin={handleTogglePin}
                  />
                </div>
              ))}
            </div>

            <Pagination
              page={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </>
        )}

        <Dialog open={detailDialog.open} onOpenChange={(open) => setDetailDialog((prev) => ({ ...prev, open }))}>
          <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Chi tiết bài thi</DialogTitle>
            </DialogHeader>
            {detailDialog.attempt && <ExamAttemptDetails attempt={detailDialog.attempt} />}
          </DialogContent>
        </Dialog>
      </section>
    </div>
  )
}
