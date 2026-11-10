import { useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/antd/dialog";
import { Button } from "@/components/antd/button";
import { toast } from "@/components/antd/toast";
import { regenerateStudyRoomCodeApi } from "@/apis/studyRoomApi";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { StudyRoomSummary } from "@/types/studyRoom";
import { RoomAccessSettings } from "./room-access-settings";

interface Props {
  room: StudyRoomSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Modal cho HOST cấu hình public/riêng tư/mã số + xem/đổi mã mời, ngay ở trang danh sách.
export function RoomAccessModal({ room, open, onOpenChange }: Props) {
  const fetchMyRooms = useStudyRoomStore((s) => s.fetchMyRooms);
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!room) return null;
  const invite = freshCode ?? room.inviteCode ?? null;

  const copy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite);
      toast.success("Đã sao chép mã mời");
    } catch {
      toast.error("Không sao chép được");
    }
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      const res = await regenerateStudyRoomCodeApi(room.id);
      setFreshCode(res.inviteCode);
      await fetchMyRooms({ forceRefresh: true });
      toast.success("Đã tạo mã mời mới");
    } catch {
      toast.error("Đổi mã thất bại");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent modalWidth={480}>
        <DialogHeader>
          <DialogTitle className="truncate">
            Quyền truy cập — {room.name}
          </DialogTitle>
          <DialogDescription>
            Chọn ai được vào phòng và ai được thêm bài vào danh sách phát.
          </DialogDescription>
        </DialogHeader>

        {invite && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-cream-strong px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Mã mời (dùng khi chế độ “Mã số”)
              </p>
              <p className="font-mono text-lg font-semibold tracking-[0.2em] text-ink">
                {invite}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={copy}
                aria-label="Sao chép mã mời"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={regenerate}
                loading={busy}
                aria-label="Tạo mã mời mới"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <RoomAccessSettings room={room} />
      </DialogContent>
    </Dialog>
  );
}
