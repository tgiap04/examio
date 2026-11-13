import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react"
import { type RecentExamAttempt, togglePinExamRoomApi } from "@/apis/studentMaterialsApi"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/antd/dialog"
import { Skeleton } from "@/components/antd/skeleton"
import { useToast } from "@/components/antd/toast"
import { useStudentMaterialsStore } from "@/stores/useStudentMaterialsStore"
import type { SessionSummary } from "./my-exams-types"
import { SessionCard } from "./components/session-card"
import { SessionHistoryDialog } from "./components/session-history-dialog"

const PAGE_SIZE = 50

// ─── Grouping logic ──────────────────────────────────────────────────────────

function groupBySession(attempts: RecentExamAttempt[]): SessionSummary[] {
  const map = new Map<string, RecentExamAttempt[]>()
  for (const a of attempts) {
    const key = a.examSessionId
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(a)
  }

  const summaries: SessionSummary[] = []
  for (const [examSessionId, group] of map) {
    const first = group[0]
    const completed = group.filter((a) => a.status === 1)

    const bestScore = completed.length > 0
      ? Math.max(...completed.map((a) => a.score ?? 0))
      : null

    const bestPercentage = completed.length > 0
      ? Math.max(
          ...completed.map((a) =>
            a.totalQuestions > 0
              ? Math.round((a.correctAnswers / a.totalQuestions) * 100)
              : 0,
          ),
        )
      : 0

    const lastAttemptAt = group.reduce(
      (max, a) => (a.startedAt > max ? a.startedAt : max),
      group[0].startedAt,
    )

    summaries.push({
      examSessionId,
      examRoomId: first.examSession.examRoom.id,
      title: first.examSession.examRoom.title,
      description: first.examSession.examRoom.description,
      showAnswersAfterSubmit: first.examSession.showAnswersAfterSubmit,
      attemptCount: group.length,
      bestScore,
      bestPercentage,
      lastAttemptAt,
      hasInProgress: group.some((a) => a.status === 0),
      inProgressAttemptId: group.find((a) => a.status === 0)?.id ?? null,
      totalViolations: group.reduce((sum, a) => sum + (a.violationCount ?? 0), 0),
      isPinned: first.isPinned,
    })
  }
  return summaries
}

function sortWithPinnedFirst(sessions: SessionSummary[]): SessionSummary[] {
  return [
    ...sessions.filter((s) => s.isPinned),
    ...sessions.filter((s) => !s.isPinned),
  ]
}

// ─── Pagination ───────────────────────────────────────────────────────────────

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

  const getVisiblePages = (): (number | "ellipsis")[] => {
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
            className={`grid h-9 w-9 place-items-center rounded-md text-sm font-medium transition-colors ${
              p === page
                ? "bg-brand-soft text-brand-strong"
                : "border border-hairline text-body hover:bg-surface-card hover:text-ink"
            }`}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        ),
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyExamsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()
  const { fetchExams: fetchExamsFromStore } = useStudentMaterialsStore()

  const currentPage = Number(searchParams.get("page")) || 1

  const [examAttempts, setExamAttempts] = useState<RecentExamAttempt[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [historyDialog, setHistoryDialog] = useState<{ open: boolean; session: SessionSummary | null }>({
    open: false,
    session: null,
  })

  const sessions = useMemo(
    () => sortWithPinnedFirst(groupBySession(examAttempts)),
    [examAttempts],
  )

  const fetchExams = useCallback(
    async (page: number) => {
      try {
        setLoading(true)
        const data = await fetchExamsFromStore(page, PAGE_SIZE)
        setExamAttempts(data.examAttempts)
        setTotal(data.total)
      } catch {
        toast.error("Không thể tải lịch sử thi")
      } finally {
        setLoading(false)
      }
    },
    [fetchExamsFromStore, toast],
  )

  useEffect(() => {
    fetchExams(currentPage)
  }, [currentPage, fetchExams])

  const handlePageChange = (page: number) => {
    setSearchParams({ page: String(page) })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleTogglePin = async (session: SessionSummary) => {
    const newPinned = !session.isPinned
    setExamAttempts((prev) =>
      prev.map((a) =>
        a.examSession.examRoom.id === session.examRoomId ? { ...a, isPinned: newPinned } : a,
      ),
    )
    try {
      await togglePinExamRoomApi(session.examRoomId)
    } catch {
      setExamAttempts((prev) =>
        prev.map((a) =>
          a.examSession.examRoom.id === session.examRoomId ? { ...a, isPinned: !newPinned } : a,
        ),
      )
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
              <Skeleton key={i} className="h-[240px] rounded-lg" />
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
          <h1 className="text-3xl tracking-tight text-ink lg:text-4xl">Bài thi của tôi</h1>
          <p className="mt-2 font-body text-base text-muted-foreground">
            Danh sách các phòng thi đã tham gia
            {sessions.length > 0 && (
              <span className="ml-2 text-sm text-muted-foreground">({sessions.length} phòng thi)</span>
            )}
          </p>
        </header>

        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-hairline-soft bg-surface-soft py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-card">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="mt-4 font-body text-base font-medium text-ink">Chưa có bài thi nào</p>
            <p className="mt-1.5 text-sm text-muted-foreground">Tham gia phòng thi để bắt đầu</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {sessions.map((session) => (
                <div
                  key={session.examSessionId}
                  className="transition-all duration-300 ease-out"
                  style={{ order: session.isPinned ? 0 : 1 }}
                >
                  <SessionCard
                    session={session}
                    onViewHistory={(s) => setHistoryDialog({ open: true, session: s })}
                    onTogglePin={handleTogglePin}
                  />
                </div>
              ))}
            </div>
            <Pagination page={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
          </>
        )}

        <Dialog
          open={historyDialog.open}
          onOpenChange={(open) => setHistoryDialog((prev) => ({ ...prev, open }))}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {historyDialog.session?.title ?? "Lịch sử bài thi"}
              </DialogTitle>
            </DialogHeader>
            <SessionHistoryDialog session={historyDialog.session} />
          </DialogContent>
        </Dialog>
      </section>
    </div>
  )
}
