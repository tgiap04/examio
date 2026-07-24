// Role trong phòng học chung. Số lớn hơn = quyền cao hơn (dùng cho so sánh minRole).
export enum StudyRoomRole {
    MEMBER = 0,
    COHOST = 1,
    HOST = 2,
}

// Chế độ vào phòng (mirror ExamSession.assessType).
export enum AccessType {
    PUBLIC = 0, // user đã đăng nhập là vào được
    CODE = 1, // cần mã mời 6 số
    WHITELIST = 2, // chỉ userId trong whitelist
}

// Ai được thêm bài vào playlist.
export enum PlaylistAddPermission {
    EVERYONE = 0,
    COHOST = 1, // cohost trở lên
    HOST = 2,
}

// Loại item playlist.
export enum PlaylistItemKind {
    VIDEO = 0,
    PLAYLIST = 1, // url là YT-playlist, player chạy như 1 đơn vị
}

// Redis key helpers cho live state (timer/media/chat/presence/focus).
// DB chỉ giữ cấu hình phòng + membership; mọi state runtime nằm ở Redis.
export const StudyRoomKeys = {
    timer: (roomId: string) => `studyroom:${roomId}:timer`,
    media: (roomId: string) => `studyroom:${roomId}:media`,
    chat: (roomId: string) => `studyroom:${roomId}:chat`,
    presence: (roomId: string, userId: string) =>
        `studyroom:${roomId}:presence:${userId}`,
    focus: (roomId: string, userId: string) =>
        `studyroom:${roomId}:focus:${userId}`,
    chatRateLimit: (roomId: string, userId: string) =>
        `studyroom:${roomId}:chatrl:${userId}`,
    focusRateLimit: (roomId: string, userId: string) =>
        `studyroom:${roomId}:focusrl:${userId}`,
    controlRateLimit: (roomId: string, userId: string) =>
        `studyroom:${roomId}:ctrlrl:${userId}`,
    member: (roomId: string, userId: string) =>
        `studyroom:${roomId}:member:${userId}`,
    room: (roomId: string) => `studyroom:${roomId}:room`,
    presenceSet: (roomId: string) => `studyroom:${roomId}:presence-set`,
    focusDirtySet: () => 'studyroom:focus-dirty',
    playback: (roomId: string) => `studyroom:${roomId}:playback`, // {currentIndex}
    playlistCount: (roomId: string) => `studyroom:${roomId}:plcount`, // số item playlist (gate onLeave)
};

export const FOCUS_CREDIT_SECONDS = 30; // cộng mỗi nhịp heartbeat hợp lệ
export const FOCUS_CREDIT_WINDOW = 25; // giây — cửa sổ chống farm (< nhịp 30s của client)

export const STUDY_ROOM_LIVE_TTL = 60 * 60 * 24; // 24h
export const PRESENCE_TTL = 90; // giây
export const CHAT_HISTORY_MAX = 200;
export const MAX_PLAYLIST_ITEMS = 100; // trần số bài trong playlist mỗi phòng
