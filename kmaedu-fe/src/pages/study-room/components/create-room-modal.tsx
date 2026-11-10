import { useState } from "react";
import { InputNumber } from "antd";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/antd/dialog";
import { Button } from "@/components/antd/button";
import { Input } from "@/components/antd/input";
import { Textarea } from "@/components/antd/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/antd/select";
import { toast } from "@/components/antd/toast";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { AccessType, PomodoroConfig } from "@/types/studyRoom";
import { PomodoroConfigFields } from "./pomodoro-config-fields";
import { DEFAULT_POMODORO } from "./study-room-actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}

export function CreateRoomModal({ open, onOpenChange, onCreated }: Props) {
  const createRoom = useStudyRoomStore((s) => s.createRoom);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maxParticipants, setMaxParticipants] = useState(15);
  const [accessType, setAccessType] = useState<number>(AccessType.PUBLIC);
  const [config, setConfig] = useState<PomodoroConfig>(DEFAULT_POMODORO);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên phòng");
      return;
    }
    setSaving(true);
    try {
      const room = await createRoom({
        name: name.trim(),
        description: description.trim() || undefined,
        maxParticipants,
        accessType,
        ...config,
      });
      if (room?.id) {
        toast.success("Đã tạo phòng học");
        onOpenChange(false);
        onCreated(room.id);
      }
    } catch {
      toast.error("Tạo phòng thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent modalWidth={480}>
        <DialogHeader>
          <DialogTitle>Tạo phòng học nhóm</DialogTitle>
          <DialogDescription>
            Đặt tên phòng và cấu hình Pomodoro cho cả nhóm.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Input
            placeholder="Tên phòng"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            placeholder="Mô tả (tuỳ chọn)"
            value={description}
            maxLength={300}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
          />
          <label className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Số người tối đa</span>
            <InputNumber
              min={2}
              max={20}
              value={maxParticipants}
              onChange={(v) => setMaxParticipants(Number(v ?? 15))}
            />
          </label>
          <div>
            <p className="mb-1.5 text-sm text-muted-foreground">Chế độ vào phòng</p>
            <Select
              value={String(accessType)}
              onValueChange={(v) => setAccessType(Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={String(AccessType.PUBLIC)}>
                  Công khai — ai đăng nhập cũng vào được
                </SelectItem>
                <SelectItem value={String(AccessType.CODE)}>
                  Mã số — cần mã mời để vào
                </SelectItem>
                <SelectItem value={String(AccessType.WHITELIST)}>
                  Riêng tư — chỉ người được thêm vào danh sách
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <PomodoroConfigFields value={config} onChange={setConfig} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={submit} loading={saving}>
            Tạo phòng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
