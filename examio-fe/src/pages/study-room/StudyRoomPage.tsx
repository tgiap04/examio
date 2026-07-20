import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/antd/button";
import { toast } from "@/components/antd/toast";
import { useStudyRoomSocket } from "@/hooks/useStudyRoomSocket";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { StudyRoomRole } from "@/types/studyRoom";
import { PomodoroPanel } from "./components/pomodoro-panel";
import { YouTubeSyncPlayer } from "./components/youtube-sync-player";
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

  const actions = useStudyRoomSocket(id, onClosed);

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
