// Hợp đồng sự kiện WebSocket cho phòng học chung — NGUỒN SỰ THẬT.
// Frontend (examio-fe/src/types/studyRoom.ts) phải mirror đúng các tên + payload này.
// Transport: websocket-only (bỏ long-polling để tránh sticky-session qua nhiều instance gateway).

export const WS_STUDY_PATH = '/ws/study';

export type TimerPhase = 'work' | 'break' | 'longbreak';

export interface TimerState {
    phase: TimerPhase;
    cycle: number; // chu kỳ work hiện tại (1-based) trong nhóm trước long-break
    phaseStartedAt: number; // epoch ms mốc bắt đầu pha hiện tại
    running: boolean;
    pausedRemainingMs?: number; // còn lại khi đang pause
}

export interface MediaState {
    url: string | null;
    playing: boolean;
    positionSec: number;
    updatedAt: number; // epoch ms — client bù trôi: positionSec + (now - updatedAt)/1000
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
    status: 'studying' | 'break' | null;
}

// Client → Server
export const ClientEvents = {
    JOIN: 'room:join',
    LEAVE: 'room:leave',
    HEARTBEAT: 'presence:heartbeat',
    TIMER_START: 'timer:start',
    TIMER_PAUSE: 'timer:pause',
    TIMER_RESET: 'timer:reset',
    TIMER_CONFIG: 'timer:config',
    MEDIA_SET: 'media:set',
    MEDIA_PLAY: 'media:play',
    MEDIA_PAUSE: 'media:pause',
    MEDIA_SEEK: 'media:seek',
    CHAT_SEND: 'chat:send',
    ROLE_GRANT: 'role:grant',
    ROLE_REVOKE: 'role:revoke',
} as const;

// Server → Client
export const ServerEvents = {
    SNAPSHOT: 'room:snapshot',
    PRESENCE_UPDATED: 'presence:updated',
    TIMER_UPDATED: 'timer:updated',
    MEDIA_UPDATED: 'media:updated',
    CHAT_MESSAGE: 'chat:message',
    ROLE_UPDATED: 'role:updated',
    ROOM_CLOSED: 'room:closed',
    ERROR: 'error',
} as const;
