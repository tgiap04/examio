import { useState } from "react";
import { Copy, RefreshCw, Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/antd/dialog";
import { Button } from "@/components/antd/button";
import { toast } from "@/components/antd/toast";
import { regenerateStudyRoomCodeApi } from "@/apis/studyRoomApi";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { PomodoroConfig, StudyRoomSummary } from "@/types/studyRoom";
import { PomodoroConfigFields } from "./pomodoro-config-fields";
import { RoomAccessSettings } from "./room-access-settings";
import { DEFAULT_POMODORO } from "./study-room-actions";

interface Props {
  room: StudyRoomSummary;
  config: PomodoroConfig | null;
  onClosed: () => void;
}

export function RoomSettingsMenu({ room, config, onClosed }: Props) {
  const { updateRoom, deleteRoom } = useStudyRoomStore();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(room.inviteCode ?? "");
  const [draft, setDraft] = useState<PomodoroConfig>(config ?? DEFAULT_POMODORO);
  const [busy, setBusy] = useState(false);

  const regenerate = async () => {
    try {
      const res = await regenerateStudyRoomCodeApi(room.id);
      setCode(res.inviteCode);
      toast.success("Đã tạo mã mời mới");
    } catch {
      toast.error("Không thể tạo mã mới");
    }
  };

  const saveConfig = async () => {
    setBusy(true);
    try {
      await updateRoom(room.id, draft);
      toast.success("Đã lưu cấu hình phòng");
    } catch {
      toast.error("Lưu thất bại");
    } finally {
      setBusy(false);
    }
  };

  const closeRoom = async () => {
    setBusy(true);
    try {
      await updateRoom(room.id, { isActive: false });
      toast.success("Đã đóng phòng");
      setOpen(false);
      onClosed();
    } finally {
      setBusy(false);
    }
  };

  const removeRoom = async () => {
    setBusy(true);
    try {
      await deleteRoom(room.id);
      toast.success("Đã xoá phòng");
      onClosed();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="icon" onClick={() => setOpen(true)}>
        <Settings className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent modalWidth={460}>
          <DialogHeader>
            <DialogTitle>Cài đặt phòng</DialogTitle>
            <DialogDescription>{room.name}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Mã mời</p>
              <div className="flex items-center gap-2">
                <span className="flex-1 rounded-md border border-hairline bg-canvas px-3 py-2 text-lg font-semibold tracking-[0.3em] text-ink">
                  {code || "------"}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard?.writeText(code);
                    toast.success("Đã sao chép mã");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={regenerate}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                Cấu hình Pomodoro
              </p>
              <PomodoroConfigFields value={draft} onChange={setDraft} />
              <div className="mt-3 flex justify-end">
                <Button onClick={saveConfig} loading={busy}>
                  Lưu cấu hình
                </Button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                Quyền truy cập & danh sách phát
              </p>
              <RoomAccessSettings room={room} />
            </div>
          </div>
          <DialogFooter className="!justify-between">
            <Button variant="outline" onClick={closeRoom} disabled={busy}>
              Đóng phòng
            </Button>
            <Button variant="destructive" onClick={removeRoom} disabled={busy}>
              Xoá phòng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
