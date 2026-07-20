import { useState } from "react";
import { Pause, Play, RotateCcw, RotateCw, Youtube } from "lucide-react";
import { Button } from "@/components/antd/button";
import { Input } from "@/components/antd/input";
import { toast } from "@/components/antd/toast";
import { MediaState } from "@/types/studyRoom";
import { StudyRoomActions } from "./study-room-actions";
import { parseYouTube } from "./youtube-loader";

interface Props {
  actions: StudyRoomActions;
  media: MediaState | null;
}

// Thanh điều khiển media (chỉ hiện với host/co-host).
export function MediaControlBar({ actions, media }: Props) {
  const [url, setUrl] = useState("");

  const applyUrl = () => {
    const trimmed = url.trim();
    if (!trimmed || !parseYouTube(trimmed).videoId) {
      toast.error("Link YouTube không hợp lệ");
      return;
    }
    actions.setMedia(trimmed);
    setUrl("");
  };

  const seekBy = (delta: number) => {
    if (!media?.url) return;
    const base =
      media.positionSec +
      (media.playing ? (Date.now() - media.updatedAt) / 1000 : 0);
    actions.seekMedia(Math.max(0, base + delta));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-hairline p-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Youtube className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          placeholder="Dán link YouTube để phát chung"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPressEnter={applyUrl}
        />
      </div>
      <Button variant="secondary" onClick={applyUrl}>
        Đặt video
      </Button>
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
          onClick={actions.playMedia}
          disabled={!media?.url}
        >
          <Play className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
