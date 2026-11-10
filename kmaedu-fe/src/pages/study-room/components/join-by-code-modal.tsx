import { useState } from "react";
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
import { toast } from "@/components/antd/toast";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoined: (id: string) => void;
}

export function JoinByCodeModal({ open, onOpenChange, onJoined }: Props) {
  const joinByCode = useStudyRoomStore((s) => s.joinByCode);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

  const submit = async () => {
    const clean = code.replace(/\D/g, "");
    if (clean.length !== 6) {
      toast.error("Mã mời gồm 6 chữ số");
      return;
    }
    setJoining(true);
    try {
      const roomId = await joinByCode(clean);
      if (roomId) {
        toast.success("Đã tham gia phòng");
        onOpenChange(false);
        onJoined(roomId);
      } else {
        toast.error("Không tìm thấy phòng");
      }
    } catch {
      toast.error("Mã mời không hợp lệ");
    } finally {
      setJoining(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent modalWidth={400}>
        <DialogHeader>
          <DialogTitle>Tham gia bằng mã mời</DialogTitle>
          <DialogDescription>Nhập mã 6 chữ số từ chủ phòng.</DialogDescription>
        </DialogHeader>
        <Input
          placeholder="000000"
          value={code}
          inputMode="numeric"
          maxLength={6}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          onPressEnter={submit}
          className="!text-center !text-2xl !tracking-[0.5em]"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={submit} loading={joining}>
            Tham gia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
