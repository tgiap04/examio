import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  getRecentFlashcardSetsApi,
  generateShareLinkApi,
  type RecentFlashcardSet,
} from "@/apis/studentMaterialsApi"
import { Button } from "@/components/antd/button"
import { Skeleton } from "@/components/antd/skeleton"
import { BookOpen, Share2, Eye, Clock, User, Copy, Check } from "lucide-react"
import { useToast } from "@/components/antd/toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/antd/dialog"
import { Input } from "@/components/antd/input"

function MaterialCard({
  material,
  onReview,
  onShare,
}: {
  material: RecentFlashcardSet
  onReview: (id: string) => void
  onShare: (id: string) => void
}) {
  return (
    <article
      className="group relative flex flex-col rounded-lg border border-hairline bg-canvas p-5 transition-all duration-200 hover:border-coral/30 hover:shadow-[0_4px_16px_rgba(20,20,19,0.06)]"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-card">
          {material.thumbnail ? (
            <img
              src={material.thumbnail}
              alt=""
              className="h-full w-full rounded-lg object-cover"
            />
          ) : (
            <BookOpen className="h-5 w-5 text-coral" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-body text-[15px] font-medium leading-snug text-ink line-clamp-2">
            {material.title}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <BookOpen className="h-3 w-3" />
              {material.flashcardCount} thẻ
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {material.viewCount}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTimeAgo(material.lastViewedAt)}
            </span>
          </div>
        </div>
      </div>

      {material.description && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-2">
          {material.description}
        </p>
      )}

      {material.progress !== undefined && (
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-muted-foreground">Tiến độ</span>
            <span className="font-medium text-ink">{material.progress}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-pill bg-hairline">
            <div
              className="h-full rounded-pill bg-coral transition-all duration-300"
              style={{ width: `${material.progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-hairline-soft pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-card">
            <User className="h-3 w-3" />
          </div>
          <span>{material.creator?.name || material.creator?.username || "Ẩn danh"}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onShare(material.id)}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-card hover:text-ink"
            aria-label="Chia sẻ"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
          <Button
            onClick={() => onReview(material.id)}
            size="sm"
            className="h-8 px-3 text-xs"
          >
            Ôn tập
          </Button>
        </div>
      </div>
    </article>
  )
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
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} tuần trước`
  return `${Math.floor(diffDays / 30)} tháng trước`
}

function ShareDialog({
  open,
  onOpenChange,
  shareUrl,
  accessCode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shareUrl: string
  accessCode: string
}) {
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  const handleCopy = (text: string, type: "url" | "code") => {
    navigator.clipboard.writeText(text)
    if (type === "url") {
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    } else {
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chia sẻ tài liệu</DialogTitle>
          <DialogDescription>
            Chia sẻ bộ flashcard này với bạn bè của bạn
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink">Liên kết chia sẻ</label>
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly className="flex-1" />
              <Button
                onClick={() => handleCopy(shareUrl, "url")}
                size="sm"
                variant={copiedUrl ? "outline" : "default"}
              >
                {copiedUrl ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                {copiedUrl ? "Đã chép" : "Sao chép"}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink">Mã truy cập</label>
            <div className="flex gap-2">
              <Input value={accessCode} readOnly className="flex-1" />
              <Button
                onClick={() => handleCopy(accessCode, "code")}
                size="sm"
                variant={copiedCode ? "outline" : "default"}
              >
                {copiedCode ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                {copiedCode ? "Đã chép" : "Sao chép"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Người khác có thể sử dụng mã này để truy cập tài liệu
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function MyMaterialsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [materials, setMaterials] = useState<RecentFlashcardSet[]>([])
  const [loading, setLoading] = useState(true)
  const [shareDialog, setShareDialog] = useState<{
    open: boolean
    shareUrl: string
    accessCode: string
  }>({
    open: false,
    shareUrl: "",
    accessCode: "",
  })

  const fetchMaterials = async () => {
    try {
      setLoading(true)
      const data = await getRecentFlashcardSetsApi(20)
      setMaterials(data.flashcardSets)
    } catch {
      toast.error("Không thể tải tài liệu học tập")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMaterials()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleReview = (setId: string) => {
    navigate(`/study-flashcard/${setId}`)
  }

  const handleShare = async (setId: string) => {
    try {
      const data = await generateShareLinkApi(setId)
      const shareUrl =
        data.shareUrl || `${window.location.origin}/study-flashcard/${setId}`

      setShareDialog({
        open: true,
        shareUrl,
        accessCode: data.accessCode,
      })
    } catch {
      toast.error("Không thể tạo liên kết chia sẻ")
    }
  }

  if (loading) {
    return (
      <div className="relative min-h-screen bg-background text-foreground">
        <section className="relative mx-auto max-w-6xl px-4 py-6 md:py-8">
          <div className="space-y-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[340px] rounded-lg" />
            ))}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <section className="relative mx-auto max-w-6xl px-4 py-6 md:py-8 mt-4">
        <header className="mb-8">
          <h1 className="text-3xl tracking-tight text-ink lg:text-4xl">
            Tài liệu học tập
          </h1>
          <p className="mt-2 font-body text-base text-muted-foreground">
            Các bộ flashcard bạn đã xem gần đây
          </p>
        </header>

        {materials.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-hairline-soft bg-surface-soft py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-card">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="mt-4 font-body text-base font-medium text-ink">
              Chưa có tài liệu học tập nào
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Bắt đầu khám phá và học các bộ flashcard
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {materials.map((material) => (
              <MaterialCard
                key={material.id}
                material={material}
                onReview={handleReview}
                onShare={handleShare}
              />
            ))}
          </div>
        )}

        <ShareDialog
          open={shareDialog.open}
          onOpenChange={(open) => setShareDialog((prev) => ({ ...prev, open }))}
          shareUrl={shareDialog.shareUrl}
          accessCode={shareDialog.accessCode}
        />
      </section>
    </div>
  )
}
