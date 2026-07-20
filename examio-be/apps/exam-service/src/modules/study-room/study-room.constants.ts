// Role trong phòng học chung. Số lớn hơn = quyền cao hơn (dùng cho so sánh minRole).
export enum StudyRoomRole {
    MEMBER = 0,
    COHOST = 1,
    HOST = 2,
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
};

export const FOCUS_CREDIT_SECONDS = 30; // cộng mỗi nhịp heartbeat hợp lệ
export const FOCUS_CREDIT_WINDOW = 25; // giây — cửa sổ chống farm (< nhịp 30s của client)

export const STUDY_ROOM_LIVE_TTL = 60 * 60 * 24; // 24h
export const PRESENCE_TTL = 90; // giây
export const CHAT_HISTORY_MAX = 200;
