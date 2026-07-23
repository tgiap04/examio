import { memo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ListMusic,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/antd/card";
import { Button } from "@/components/antd/button";
import { Input } from "@/components/antd/input";
import { Badge } from "@/components/antd/badge";
import { toast } from "@/components/antd/toast";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import {
  PlaylistAddPermission,
  PlaylistItemKind,
  StudyRoomRole,
} from "@/types/studyRoom";
import { StudyRoomActions } from "./study-room-actions";
import { parseYouTube } from "./youtube-loader";

interface Props {
  actions: StudyRoomActions;
  myRole: number;
}

// Quyền thêm bài: EVERYONE→mọi thành viên, COHOST→cohost+, HOST→chỉ host.
function canAddToPlaylist(perm: number | undefined, myRole: number): boolean {
  const p = perm ?? PlaylistAddPermission.COHOST;
  if (p === PlaylistAddPermission.EVERYONE) return true;
  if (p === PlaylistAddPermission.HOST) return myRole >= StudyRoomRole.HOST;
  return myRole >= StudyRoomRole.COHOST;
}

function PlaylistPanelBase({ actions, myRole }: Props) {
  const playlist = useStudyRoomStore((s) => s.playlist);
  const room = useStudyRoomStore((s) => s.room);
  const roster = useStudyRoomStore((s) => s.roster);
  const [url, setUrl] = useState("");
  const dragIndex = useRef<number | null>(null);

  const canControl = myRole >= StudyRoomRole.COHOST;
  const canAdd = canAddToPlaylist(room?.playlistAddPermission, myRole);
  const leaderName =
    roster.find((r) => r.userId === playlist.leaderUserId)?.name ?? null;

  const add = () => {
    const trimmed = url.trim();
    const parsed = parseYouTube(trimmed);
    // Chỉ "My Mix" cá nhân (list=RDMM...) là không nhúng được; nếu không kèm video
    // thì không còn gì phát → chặn rõ ràng. Radio theo video (RD<videoId>) và
    // playlist (PL...) đều nhúng được nên vẫn thêm bình thường.
    const isMyMix = parsed.listId?.startsWith("RDMM") ?? false;
    if (isMyMix && !parsed.videoId) {
      toast.error(
        "Link 'Mix' cá nhân của YouTube không phát được. Hãy dùng link video hoặc link playlist (playlist?list=PL...).",
      );
      return;
    }
    if (!trimmed || (!parsed.videoId && !parsed.listId)) {
      toast.error("Link YouTube không hợp lệ");
      return;
    }
    actions.addToPlaylist(trimmed);
    setUrl("");
  };

  const onDrop = (targetIndex: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === targetIndex) return;
    const ids = playlist.items.map((it) => it.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(targetIndex, 0, moved);
    actions.reorderPlaylist(ids);
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 !text-base">
          <ListMusic className="h-4 w-4" /> Danh sách phát
        </CardTitle>
        {canControl && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={actions.playlistPrev}
              disabled={playlist.items.length === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={actions.playlistNext}
              disabled={playlist.items.length === 0}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pb-4">
        <div className="max-h-56 divide-y divide-hairline overflow-y-auto">
          {playlist.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Chưa có bài nào trong danh sách
            </p>
          ) : (
            playlist.items.map((item, i) => {
              const isNow = i === playlist.currentIndex;
              return (
                <div
                  key={item.id}
                  draggable={canControl}
                  onDragStart={() => (dragIndex.current = i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(i)}
                  className={`flex items-center gap-2 py-2 ${
                    isNow ? "bg-primary/5" : ""
                  }`}
                >
                  {canControl && (
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                  )}
                  <button
                    type="button"
                    onClick={() => canControl && actions.playlistJump(i)}
                    className="min-w-0 flex-1 text-left"
                    disabled={!canControl}
                  >
                    <div className="flex items-center gap-2">
                      {isNow && <Play className="h-3 w-3 shrink-0 text-primary" />}
                      <span className="truncate text-sm text-ink">
                        {item.title || item.url}
                      </span>
                      {item.kind === PlaylistItemKind.PLAYLIST && (
                        <Badge variant="info">Playlist</Badge>
                      )}
                    </div>
                  </button>
                  {canControl && (
                    <button
                      type="button"
                      onClick={() => actions.removePlaylistItem(item.id)}
                      className="p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {leaderName && (
          <p className="text-xs text-muted-foreground">Điều phối: {leaderName}</p>
        )}

        {canAdd && (
          <div className="flex items-center gap-2 pt-1">
            <Input
              placeholder="Dán link video/playlist YouTube"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPressEnter={add}
            />
            <Button size="icon" onClick={add} disabled={!url.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const PlaylistPanel = memo(PlaylistPanelBase);
