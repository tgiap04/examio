// Mirror hợp đồng WS backend: examio-be/apps/exam-service/src/modules/study-room/study-room.events.ts
// Giữ đồng bộ tên event + shape payload với file đó (nguồn sự thật).

export const WS_STUDY_PATH = "/ws/study";

export enum StudyRoomRole {
  MEMBER = 0,
  COHOST = 1,
  HOST = 2,
}

export type TimerPhase = "work" | "break" | "longbreak";

export interface PomodoroConfig {
  workMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
}

export interface TimerState {
  phase: TimerPhase;
  cycle: number;
  phaseStartedAt: number;
  running: boolean;
  pausedRemainingMs?: number;
}

export interface MediaState {
  url: string | null;
  playing: boolean;
  positionSec: number;
  updatedAt: number;
}

export interface ChatMessage {
  userId: string;
  name: string;
  content: string;
  at: number;
}

export interface RosterEntry {
  userId: string;
  name: string | null;
  avatar: string | null;
  role: number;
  online: boolean;
  status: "studying" | "break" | null;
}

export interface StudyRoomSummary {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  maxParticipants: number;
  hostId: string;
  inviteCode?: string;
}

export interface RoomSnapshot {
  room: StudyRoomSummary;
  config: PomodoroConfig;
  timer: TimerState;
  media: MediaState;
  chat: ChatMessage[];
  roster: RosterEntry[];
  myRole: number;
}

// Phòng trong danh sách "của tôi" (REST /studyrooms/mine)
export interface StudyRoomListItem extends StudyRoomSummary, PomodoroConfig {
  currentMediaUrl?: string | null;
  host?: { id: string; name: string | null; avatar: string | null };
  _count?: { members: number };
  createdAt?: string;
  updatedAt?: string;
}

export interface LeaderboardEntry {
  userId: string;
  role: number;
  totalFocusSeconds: number;
  user: { id: string; name: string | null; avatar: string | null };
}

// Client → Server
export const ClientEvents = {
  JOIN: "room:join",
  LEAVE: "room:leave",
  HEARTBEAT: "presence:heartbeat",
  TIMER_START: "timer:start",
  TIMER_PAUSE: "timer:pause",
  TIMER_RESET: "timer:reset",
  TIMER_CONFIG: "timer:config",
  MEDIA_SET: "media:set",
  MEDIA_PLAY: "media:play",
  MEDIA_PAUSE: "media:pause",
  MEDIA_SEEK: "media:seek",
  CHAT_SEND: "chat:send",
  ROLE_GRANT: "role:grant",
  ROLE_REVOKE: "role:revoke",
} as const;

// Server → Client
export const ServerEvents = {
  SNAPSHOT: "room:snapshot",
  PRESENCE_UPDATED: "presence:updated",
  TIMER_UPDATED: "timer:updated",
  MEDIA_UPDATED: "media:updated",
  CHAT_MESSAGE: "chat:message",
  ROLE_UPDATED: "role:updated",
  ROOM_CLOSED: "room:closed",
  ERROR: "error",
} as const;
