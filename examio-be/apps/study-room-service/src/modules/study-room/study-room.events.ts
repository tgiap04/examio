// Hợp đồng sự kiện WebSocket cho phòng học chung — NGUỒN SỰ THẬT.
// Frontend (examio-fe/src/types/studyRoom.ts) phải mirror đúng các tên + payload này.
// Transport: websocket-only (bỏ long-polling để tránh sticky-session qua nhiều instance gateway).

export const WS_STUDY_PATH = '/ws/study';

/** Per-user socket.io room: every socket of a user joins it on connect. */
export const userRoom = (userId: string): string => `user:${userId}`;

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
    isBanned: boolean;
    isMuted: boolean;
}

export interface PlaylistItem {
    id: string;
    url: string;
    kind: number; // 0 VIDEO | 1 PLAYLIST
    title: string | null;
    addedByUserId: string;
    order: number;
}

export interface PlaylistState {
    items: PlaylistItem[];
    currentIndex: number;
    leaderUserId: string | null; // client duy nhất được báo media:ended
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
    // Playlist
    PLAYLIST_ADD: 'playlist:add',
    PLAYLIST_REMOVE: 'playlist:remove',
    PLAYLIST_REORDER: 'playlist:reorder',
    PLAYLIST_NEXT: 'playlist:next',
    PLAYLIST_PREV: 'playlist:prev',
    PLAYLIST_JUMP: 'playlist:jump',
    MEDIA_ENDED: 'media:ended', // CHỈ leader gửi
    // Chặn cá nhân
    CHAT_BLOCK: 'chat:block',
    CHAT_UNBLOCK: 'chat:unblock',
    // Moderation (HOST/COHOST)
    MEMBER_BAN: 'member:ban',
    MEMBER_UNBAN: 'member:unban',
    MEMBER_MUTE: 'member:mute',
    MEMBER_UNMUTE: 'member:unmute',
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
    PLAYLIST_UPDATED: 'playlist:updated', // {items, currentIndex, leaderUserId}
    BLOCKS_UPDATED: 'blocks:updated', // {blockedUserIds} — chỉ gửi cho chính người chặn
    MEMBER_MODERATED: 'member:moderated', // {userId, isBanned?, isMuted?}
    ROOM_KICKED: 'room:kicked', // gửi cho người bị ban trước khi disconnect (CHỈ ban trong phòng)
    // Token hết hạn hoặc quyền đổi: {reason: 'TOKEN_EXPIRED' | 'AUTHZ_CHANGED'}. Gửi ngay trước
    // khi server ngắt kết nối; client refresh token rồi kết nối lại.
    AUTH_REAUTH: 'auth:reauth',
    ERROR: 'error',
} as const;
