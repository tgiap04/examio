import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/antd/button"
import { snapshotBannerState, type SnapshotDrift } from "@/lib/exam-session/snapshot-banner"

interface SnapshotOutdatedBannerProps {
  drift: SnapshotDrift
  /** Whether the viewer may manage sessions (`exam_session:manage`). */
  canManage: boolean
  pending: boolean
  onRefresh: () => void
}

export function SnapshotOutdatedBanner({ drift, canManage, pending, onRefresh }: SnapshotOutdatedBannerProps) {
  const { show, showButton } = snapshotBannerState(drift, canManage)
  if (!show) return null

  return (
    <div
      role="status"
      className="mt-1 flex flex-wrap items-center gap-2 rounded-md bg-accent-amber/10 px-2 py-1 text-xs text-accent-amber"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>Đề đã thay đổi kể từ khi tạo phiên</span>
      {showButton && (
        <>
          <span aria-hidden>—</span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            disabled={pending}
            onClick={onRefresh}
          >
            {pending ? "Đang cập nhật..." : "Cập nhật đề"}
          </Button>
        </>
      )}
    </div>
  )
}
