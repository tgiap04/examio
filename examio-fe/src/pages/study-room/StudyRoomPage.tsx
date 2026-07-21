import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/antd/button";
import { toast } from "@/components/antd/toast";
import { useStudyRoomSocket } from "@/hooks/useStudyRoomSocket";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { StudyRoomRole } from "@/types/studyRoom";
import { PomodoroPanel } from "./components/pomodoro-panel";
import { YouTubeSyncPlayer } from "./components/youtube-sync-player";
import { PlaylistPanel } from "./components/playlist-panel";
import { RosterPanel } from "./components/roster-panel";
import { ChatPanel } from "./components/chat-panel";
import { LeaderboardPanel } from "./components/leaderboard-panel";
import { RoomSettingsMenu } from "./components/room-settings-menu";

const CONN_LABEL: Record<string, string> = {
  idle: "Đang chờ",
  connecting: "Đang kết nối…",
  connected: "Đã kết nối",
  disconnected: "Mất kết nối",
};

export default function StudyRoomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const onClosed = useCallback(() => {
    toast.error("Phòng đã đóng");
    navigate("/k/study-room");
  }, [navigate]);

  const onKicked = useCallback(() => {
    toast.error("Bạn đã bị mời khỏi phòng");
    navigate("/k/study-room");
  }, [navigate]);

  const myRooms = useStudyRoomStore((s) => s.myRooms);
  const joinById = useStudyRoomStore((s) => s.joinById);
  const fetchMyRooms = useStudyRoomStore((s) => s.fetchMyRooms);

  // Deep-link/refresh thẳng vào phòng: myRooms có thể rỗng nên phải xác định
  // membership TRƯỚC khi quyết định auto-join (tránh POST join thừa mỗi lần tải
  // cho người đã là member). Đã là member → WS tự lấy snapshot. Chưa là member →
  // thử join public/whitelist; thất bại (cần mã / không có quyền) thì báo rõ,
  // không nuốt lỗi âm thầm. Phòng dùng mã vẫn vào qua modal nhập mã ở trang danh sách.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      if (myRooms.length === 0) {
        await fetchMyRooms().catch(() => {});
      }
      if (cancelled) return;
      const mine = useStudyRoomStore.getState().myRooms;
      if (mine.some((r) => r.id === id)) return;
      try {
        await joinById(id);
      } catch {
        if (!cancelled) {
          toast.error(
            "Không vào được phòng. Phòng có thể yêu cầu mã mời hoặc bạn không có quyền truy cập.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const actions = useStudyRoomSocket(id, onClosed, onKicked);

  const room = useStudyRoomStore((s) => s.room);
  const config = useStudyRoomStore((s) => s.config);
  const myRole = useStudyRoomStore((s) => s.myRole);
  const connState = useStudyRoomStore((s) => s.connState);

  const isHost = myRole >= StudyRoomRole.HOST;
  const connected = connState === "connected";

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-hairline bg-surface-card/90 px-4 py-3 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/k/study-room")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg text-ink">
            {room?.name ?? "Phòng học"}
          </h1>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={`h-2 w-2 rounded-full ${
                connected
                  ? "bg-success"
                  : connState === "connecting"
                    ? "bg-warning"
                    : "bg-destructive"
              }`}
            />
            {CONN_LABEL[connState] ?? connState}
          </span>
        </div>
        {isHost && room && (
          <RoomSettingsMenu
            room={room}
            config={config}
            onClosed={() => navigate("/k/study-room")}
          />
        )}
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-12">
        <section className="flex flex-col gap-4 lg:col-span-5">
          <div className="sticky top-[68px] z-10 lg:static">
            <YouTubeSyncPlayer actions={actions} myRole={myRole} />
          </div>
          <PlaylistPanel actions={actions} myRole={myRole} />
          <PomodoroPanel actions={actions} myRole={myRole} />
        </section>

        <section className="flex flex-col gap-4 lg:col-span-4">
          <RosterPanel actions={actions} myRole={myRole} />
          {id && <LeaderboardPanel roomId={id} />}
        </section>

        <section className="flex min-h-[24rem] flex-col lg:col-span-3">
          <ChatPanel actions={actions} />
        </section>
      </main>
    </div>
  );
}
