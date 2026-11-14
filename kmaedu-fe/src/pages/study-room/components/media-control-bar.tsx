import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/antd/button";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { MediaState } from "@/types/studyRoom";
import { StudyRoomActions } from "./study-room-actions";

interface Props {
  actions: StudyRoomActions;
  media: MediaState | null;
}

// Thanh điều khiển phát (chỉ host/co-host). Nguồn phát DUY NHẤT là danh sách phát:
// thêm link ở PlaylistPanel, thanh này chỉ điều khiển item đang phát.
export function MediaControlBar({ actions, media }: Props) {
  const playlist = useStudyRoomStore((s) => s.playlist);
  const hasItems = playlist.items.length > 0;

  const seekBy = (delta: number) => {
    if (!media?.url) return;
    const base =
      media.positionSec +
      (media.playing ? (Date.now() - media.updatedAt) / 1000 : 0);
    actions.seekMedia(Math.max(0, base + delta));
  };

  // Bấm phát: đang có media thì tiếp tục; chưa có thì phát item đang chọn trong
  // danh sách (mặc định item đầu ở currentIndex = 0).
  const onPlay = () => {
    if (media?.url) actions.playMedia();
    else if (hasItems) actions.playlistJump(playlist.currentIndex);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-hairline p-3">
      <Button
        variant="outline"
        size="icon"
        onClick={() => seekBy(-15)}
        disabled={!media?.url}
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={() => seekBy(15)}
        disabled={!media?.url}
      >
        <RotateCw className="h-4 w-4" />
      </Button>
      {media?.playing ? (
        <Button variant="outline" size="icon" onClick={actions.pauseMedia}>
          <Pause className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          variant="outline"
          size="icon"
          onClick={onPlay}
          disabled={!media?.url && !hasItems}
        >
          <Play className="h-4 w-4" />
        </Button>
      )}
      <span className="ml-1 text-xs text-muted-foreground">
        Thêm link ở danh sách phát bên dưới
      </span>
    </div>
  );
}
