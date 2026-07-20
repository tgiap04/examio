import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { env } from "@/lib/env";
import { useAuthStore } from "@/stores/useAuthStore";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { computeTimerView } from "@/lib/pomodoro";
import {
  ClientEvents,
  ServerEvents,
  WS_STUDY_PATH,
  ChatMessage,
  MediaState,
  PomodoroConfig,
  RoomSnapshot,
  TimerState,
} from "@/types/studyRoom";

// Socket.io endpoint origin. apiUrl tương đối ("/api/v1") hoặc rỗng → same-origin
// ("" cho socket.io): dev đi qua Vite proxy /ws/study, prod qua reverse proxy.
// apiUrl tuyệt đối → dùng origin của nó (BE khác domain).
function wsOrigin(): string {
  const apiUrl = env.apiUrl;
  if (!apiUrl || apiUrl.startsWith("/")) return "";
  try {
    return new URL(apiUrl).origin;
  } catch {
    return "";
  }
}

// Kết nối 1 phòng: mở socket, join, map event → store, heartbeat, dọn dẹp khi unmount.
export function useStudyRoomSocket(
  roomId: string | undefined,
  onClosed?: () => void,
) {
  const socketRef = useRef<Socket | null>(null);
  const myId = String(useAuthStore.getState().user?.id ?? "");

  useEffect(() => {
    if (!roomId) return;
    const store = useStudyRoomStore.getState;
    store().setConnState("connecting");

    const socket = io(wsOrigin(), {
      path: WS_STUDY_PATH,
      transports: ["websocket"],
      withCredentials: true,
    });
    socketRef.current = socket;

    const sendHeartbeat = () => {
      if (document.visibilityState !== "visible") return;
      const { timer, config } = store();
      let status: "studying" | "break" = "break";
      if (timer && config) {
        const view = computeTimerView(timer, config, Date.now());
        status = view.running && view.phase === "work" ? "studying" : "break";
      }
      socket.emit(ClientEvents.HEARTBEAT, { roomId, status });
    };

    // connect fires trên cả lần đầu lẫn reconnect → luôn re-join để nhận snapshot mới.
    socket.on("connect", () => {
      store().setConnState("connected");
      socket.emit(ClientEvents.JOIN, { roomId });
      sendHeartbeat();
    });
    socket.on("disconnect", () => store().setConnState("disconnected"));

    socket.on(ServerEvents.SNAPSHOT, (s: RoomSnapshot | null) => {
      if (s) store().applySnapshot(s);
    });
    socket.on(
      ServerEvents.TIMER_UPDATED,
      (p: { timer: TimerState; config?: PomodoroConfig }) =>
        store().applyTimer(p.timer, p.config),
    );
    socket.on(ServerEvents.MEDIA_UPDATED, (m: MediaState) =>
      store().applyMedia(m),
    );
    socket.on(
      ServerEvents.PRESENCE_UPDATED,
      (p: {
        userId: string;
        online: boolean;
        status: "studying" | "break" | null;
      }) => store().applyPresence(p),
    );
    socket.on(ServerEvents.CHAT_MESSAGE, (p: { message: ChatMessage }) =>
      store().appendChat(p.message),
    );
    socket.on(
      ServerEvents.ROLE_UPDATED,
      (p: { userId: string; role: number }) =>
        store().applyRole(p.userId, p.role, p.userId === myId),
    );
    socket.on(ServerEvents.ROOM_CLOSED, () => {
      onClosed?.();
    });

    const hb = setInterval(sendHeartbeat, 30_000);
    const onVisible = () => sendHeartbeat();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(hb);
      document.removeEventListener("visibilitychange", onVisible);
      socket.emit(ClientEvents.LEAVE, { roomId });
      socket.disconnect();
      socketRef.current = null;
      store().resetRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const emit = useCallback((event: string, payload: Record<string, unknown>) => {
    socketRef.current?.emit(event, { ...payload });
  }, []);

  return {
    startTimer: () => emit(ClientEvents.TIMER_START, { roomId }),
    pauseTimer: () => emit(ClientEvents.TIMER_PAUSE, { roomId }),
    resetTimer: () => emit(ClientEvents.TIMER_RESET, { roomId }),
    updateConfig: (cfg: Partial<PomodoroConfig>) =>
      emit(ClientEvents.TIMER_CONFIG, { roomId, ...cfg }),
    setMedia: (url: string) => emit(ClientEvents.MEDIA_SET, { roomId, url }),
    playMedia: () => emit(ClientEvents.MEDIA_PLAY, { roomId }),
    pauseMedia: () => emit(ClientEvents.MEDIA_PAUSE, { roomId }),
    seekMedia: (positionSec: number) =>
      emit(ClientEvents.MEDIA_SEEK, { roomId, positionSec }),
    sendChat: (content: string) =>
      emit(ClientEvents.CHAT_SEND, { roomId, content }),
    grantRole: (userId: string) =>
      emit(ClientEvents.ROLE_GRANT, { roomId, userId }),
    revokeRole: (userId: string) =>
      emit(ClientEvents.ROLE_REVOKE, { roomId, userId }),
  };
}
