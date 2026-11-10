import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/antd/button";
import { Input } from "@/components/antd/input";
import { Badge } from "@/components/antd/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/antd/select";
import { toast } from "@/components/antd/toast";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import {
  AccessType,
  PlaylistAddPermission,
  StudyRoomSummary,
} from "@/types/studyRoom";

interface Props {
  room: StudyRoomSummary;
}

// Host cấu hình chế độ vào phòng + quyền thêm bài. Lưu qua updateStudyRoomApi.
export function RoomAccessSettings({ room }: Props) {
  const updateRoom = useStudyRoomStore((s) => s.updateRoom);
  const [access, setAccess] = useState<number>(
    room.accessType ?? AccessType.PUBLIC,
  );
  const [playlistPerm, setPlaylistPerm] = useState<number>(
    room.playlistAddPermission ?? PlaylistAddPermission.COHOST,
  );
  const [whitelist, setWhitelist] = useState<string[]>(room.whitelist ?? []);
  const [entry, setEntry] = useState("");
  const [busy, setBusy] = useState(false);

  const addToWhitelist = () => {
    const id = entry.trim();
    if (!id || whitelist.includes(id)) return;
    setWhitelist([...whitelist, id]);
    setEntry("");
  };

  const save = async () => {
    setBusy(true);
    try {
      await updateRoom(room.id, {
        accessType: access,
        playlistAddPermission: playlistPerm,
        whitelist: access === AccessType.WHITELIST ? whitelist : undefined,
      });
      toast.success("Đã lưu quyền truy cập");
    } catch {
      toast.error("Lưu thất bại");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 mt-2.5">
      <div>
        <p className="mb-1.5 text-sm text-muted-foreground">Chế độ vào phòng</p>
        <Select
          value={String(access)}
          onValueChange={(v) => setAccess(Number(v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={String(AccessType.PUBLIC)}>Công khai</SelectItem>
            <SelectItem value={String(AccessType.CODE)}>Mã số</SelectItem>
            <SelectItem value={String(AccessType.WHITELIST)}>
              Danh sách trắng
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {access === AccessType.WHITELIST && (
        <div>
          <p className="mb-1.5 text-sm text-muted-foreground">
            Danh sách trắng (userId)
          </p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {whitelist.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                Chưa có ai trong danh sách
              </span>
            ) : (
              whitelist.map((id) => (
                <Badge key={id} variant="secondary">
                  <span className="max-w-[8rem] truncate">{id}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setWhitelist(whitelist.filter((w) => w !== id))
                    }
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Nhập userId"
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              onPressEnter={addToWhitelist}
            />
            <Button variant="outline" onClick={addToWhitelist}>
              Thêm
            </Button>
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-sm text-muted-foreground">
          Ai được thêm bài vào danh sách phát
        </p>
        <Select
          value={String(playlistPerm)}
          onValueChange={(v) => setPlaylistPerm(Number(v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={String(PlaylistAddPermission.EVERYONE)}>
              Mọi thành viên
            </SelectItem>
            <SelectItem value={String(PlaylistAddPermission.COHOST)}>
              Co-host trở lên
            </SelectItem>
            <SelectItem value={String(PlaylistAddPermission.HOST)}>
              Chỉ chủ phòng
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} loading={busy}>
          Lưu quyền truy cập
        </Button>
      </div>
    </div>
  );
}
