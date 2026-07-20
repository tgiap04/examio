import { memo, useEffect, useRef, useState } from "react";
import { Card } from "@/components/antd/card";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { StudyRoomRole } from "@/types/studyRoom";
import { StudyRoomActions } from "./study-room-actions";
import { MediaControlBar } from "./media-control-bar";
import { loadYouTubeApi, parseYouTube } from "./youtube-loader";

interface Props {
  actions: StudyRoomActions;
  myRole: number;
}

interface YTPlayer {
  destroy?: () => void;
  loadVideoById: (id: string, start?: number) => void;
  cueVideoById: (id: string, start?: number) => void;
  playVideo?: () => void;
  pauseVideo?: () => void;
  getCurrentTime?: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
}

function expectedPosition(media: {
  positionSec: number;
  playing: boolean;
  updatedAt: number;
}): number {
  return (
    media.positionSec +
    (media.playing ? (Date.now() - media.updatedAt) / 1000 : 0)
  );
}

function YouTubeSyncPlayerBase({ actions, myRole }: Props) {
  const media = useStudyRoomStore((s) => s.media);
  const canControl = myRole >= StudyRoomRole.COHOST;
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const isSyncing = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUrl = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [joined, setJoined] = useState(false);

  // Khởi tạo player sau khi user bấm "tham gia phát chung" (autoplay policy).
  useEffect(() => {
    if (!joined || !hostRef.current) return;
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current) return;
      const w = window as unknown as { YT: { Player: new (...a: unknown[]) => YTPlayer } };
      playerRef.current = new w.YT.Player(hostRef.current, {
        width: "100%",
        height: "100%",
        playerVars: canControl
          ? { rel: 0, playsinline: 1 }
          : { controls: 0, disablekb: 1, rel: 0, playsinline: 1 },
        events: { onReady: () => setReady(true) },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [joined, canControl]);

  // Đồng bộ url + play/pause từ store.
  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player || !media) return;
    const { videoId } = parseYouTube(media.url ?? "");
    isSyncing.current = true;
    if (videoId && media.url !== lastUrl.current) {
      lastUrl.current = media.url;
      const start = Math.max(0, Math.floor(expectedPosition(media)));
      if (media.playing) player.loadVideoById(videoId, start);
      else player.cueVideoById(videoId, start);
    } else if (media.playing) {
      player.playVideo?.();
    } else {
      player.pauseVideo?.();
    }
    const t = setTimeout(() => (isSyncing.current = false), 600);
    return () => clearTimeout(t);
  }, [ready, media]);

  // Chống drift: mỗi 5s so vị trí thực với vị trí kỳ vọng.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const player = playerRef.current;
      const m = useStudyRoomStore.getState().media;
      if (!player?.getCurrentTime || !m?.url || !m.playing) return;
      const expected = expectedPosition(m);
      const actual = player.getCurrentTime();
      if (Math.abs(actual - expected) > 2) {
        isSyncing.current = true;
        player.seekTo(expected, true);
        syncTimer.current = setTimeout(() => (isSyncing.current = false), 600);
      }
    }, 5000);
    return () => {
      clearInterval(id);
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [ready]);

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-video w-full bg-surface-dark">
        {joined ? (
          <>
            <div ref={hostRef} className="h-full w-full" />
            {!canControl && (
              <div className="absolute inset-0 z-10 cursor-not-allowed" />
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setJoined(true)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-on-dark"
          >
            <span className="text-4xl">▶</span>
            <span className="text-sm font-medium">
              Bấm để tham gia phát chung
            </span>
          </button>
        )}
      </div>
      {canControl && <MediaControlBar actions={actions} media={media} />}
    </Card>
  );
}

export const YouTubeSyncPlayer = memo(YouTubeSyncPlayerBase);
