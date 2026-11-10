import { memo, useEffect, useRef, useState } from "react";
import { Card } from "@/components/antd/card";
import { toast } from "@/components/antd/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/antd/tooltip";
import { useAuthStore } from "@/stores/useAuthStore";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { PlaylistItemKind, StudyRoomRole } from "@/types/studyRoom";
import { StudyRoomActions } from "./study-room-actions";
import { MediaControlBar } from "./media-control-bar";
import { loadYouTubeApi, parseYouTube } from "./youtube-loader";

interface Props {
  actions: StudyRoomActions;
  myRole: number;
}

type PlaylistCue = { listType: "playlist"; list: string };

interface YTPlayer {
  destroy?: () => void;
  loadVideoById: (id: string, start?: number) => void;
  cueVideoById: (id: string, start?: number) => void;
  loadPlaylist?: (cue: PlaylistCue) => void;
  cuePlaylist?: (cue: PlaylistCue) => void;
  playVideo?: () => void;
  pauseVideo?: () => void;
  getCurrentTime?: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
}

const YT_ENDED = 0; // YT.PlayerState.ENDED

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
  const playlist = useStudyRoomStore((s) => s.playlist);
  const myId = String(useAuthStore.getState().user?.id ?? "");
  const canControl = myRole >= StudyRoomRole.COHOST;
  const current = playlist.items[playlist.currentIndex];
  // Có nguồn để phát khi playlist có bài HOẶC đã có media url đang phát chung.
  const hasSource = playlist.items.length > 0 || !!media?.url;
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const isSyncing = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUrl = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [joined, setJoined] = useState(false);
  // canControl được ghim tại lúc khởi tạo player qua ref: đổi role giữa phiên
  // KHÔNG được destroy/recreate iframe (gây giật/reset playback) — chỉ tác động
  // tới native controls, còn khả năng điều khiển đã do overlay + MediaControlBar
  // (render-driven) xử lý và cập nhật tức thì.
  const canControlRef = useRef(canControl);
  canControlRef.current = canControl;

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
        // origin: YouTube khuyến nghị luôn khai báo origin cho IFrame API.
        playerVars: {
          origin: window.location.origin,
          rel: 0,
          playsinline: 1,
          ...(canControlRef.current
            ? {}
            : { controls: 0, disablekb: 1 }),
        },
        events: {
          onReady: () => setReady(true),
          // Chỉ leader báo media:ended để server tự sang bài kế (tránh N client cùng gửi).
          onStateChange: (e: { data: number }) => {
            if (e.data !== YT_ENDED) return;
            const pl = useStudyRoomStore.getState().playlist;
            if (myId && myId === pl.leaderUserId) {
              actions.mediaEnded(pl.currentIndex);
            }
          },
          // Video không phát được (thường gặp: bản quyền chặn phát nhúng → mã 101/150,
          // hoặc video bị gỡ/riêng tư → 100, tham số sai → 2, lỗi player → 5).
          // Không để user chỉ thấy màn lỗi khó hiểu của YouTube: báo rõ + leader tự
          // chuyển sang bài kế (dùng lại đường advance của media:ended).
          onError: (e: { data: number }) => {
            const embedBlocked = e.data === 101 || e.data === 150;
            toast.error(
              embedBlocked
                ? "Video này bị chặn phát nhúng (bản quyền). Hãy thử link khác."
                : "Không phát được video này. Hãy thử link khác.",
            );
            const pl = useStudyRoomStore.getState().playlist;
            if (myId && myId === pl.leaderUserId && pl.items.length > 1) {
              actions.mediaEnded(pl.currentIndex);
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
    // actions/myId/canControl cố tình bắt tại lúc khởi tạo player (emit/socket
    // ổn định); KHÔNG rebuild theo canControl để đổi role không reset playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined]);

  // Đồng bộ url + play/pause từ store. media.url luôn phản ánh item đang phát.
  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player || !media) return;
    const { videoId, listId } = parseYouTube(media.url ?? "");
    const isPlaylistKind = current?.kind === PlaylistItemKind.PLAYLIST;
    isSyncing.current = true;
    if (media.url && media.url !== lastUrl.current) {
      lastUrl.current = media.url;
      const start = Math.max(0, Math.floor(expectedPosition(media)));
      if (isPlaylistKind && listId) {
        const cue: PlaylistCue = { listType: "playlist", list: listId };
        if (media.playing) player.loadPlaylist?.(cue);
        else player.cuePlaylist?.(cue);
      } else if (videoId) {
        if (media.playing) player.loadVideoById(videoId, start);
        else player.cueVideoById(videoId, start);
      }
    } else if (media.playing) {
      player.playVideo?.();
    } else {
      player.pauseVideo?.();
    }
    const t = setTimeout(() => (isSyncing.current = false), 600);
    return () => clearTimeout(t);
  }, [ready, media, current]);

  // Chống drift: mỗi 5s so vị trí thực với vị trí kỳ vọng.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const player = playerRef.current;
      const st = useStudyRoomStore.getState();
      const m = st.media;
      // YT-playlist đồng bộ mức "đang phát playlist", không so vị trí video con.
      const cur = st.playlist.items[st.playlist.currentIndex];
      if (cur?.kind === PlaylistItemKind.PLAYLIST) return;
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
          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                aria-disabled={!hasSource}
                onClick={() => hasSource && setJoined(true)}
                className={`absolute inset-0 flex flex-col items-center justify-center gap-2 text-on-dark ${
                  hasSource ? "" : "cursor-not-allowed opacity-60"
                }`}
              >
                <span className="text-4xl">▶</span>
                <span className="text-sm font-medium">
                  {hasSource
                    ? "Bấm để tham gia phát chung"
                    : "Chưa có video để phát"}
                </span>
              </button>
            </TooltipTrigger>
            {!hasSource && (
              <TooltipContent>Cần có link video để phát chung</TooltipContent>
            )}
          </Tooltip>
        )}
      </div>
      {canControl && <MediaControlBar actions={actions} media={media} />}
    </Card>
  );
}

export const YouTubeSyncPlayer = memo(YouTubeSyncPlayerBase);
