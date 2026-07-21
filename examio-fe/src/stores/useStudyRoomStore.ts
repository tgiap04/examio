import { create } from "zustand";
import {
  createStudyRoomApi,
  getMyStudyRoomsApi,
  joinStudyRoomByCodeApi,
  joinStudyRoomByIdApi,
  updateStudyRoomApi,
  deleteStudyRoomApi,
  leaveStudyRoomApi,
  type CreateStudyRoomPayload,
  type UpdateStudyRoomPayload,
} from "@/apis/studyRoomApi";
import { storeCache, CacheTTL } from "@/lib/storeCache";
import {
  ChatMessage,
  MediaState,
  PlaylistState,
  PomodoroConfig,
  RoomSnapshot,
  RosterEntry,
  StudyRoomListItem,
  StudyRoomSummary,
  TimerState,
} from "@/types/studyRoom";

const EMPTY_PLAYLIST: PlaylistState = {
  items: [],
  currentIndex: 0,
  leaderUserId: null,
};

const MY_ROOMS_KEY = "study-rooms:mine";

type ConnState = "idle" | "connecting" | "connected" | "disconnected";

interface StudyRoomStore {
  // Danh sách phòng của tôi (REST + cache)
  myRooms: StudyRoomListItem[];
  loadingMine: boolean;

  // Phòng đang mở (socket-driven)
  room: StudyRoomSummary | null;
  config: PomodoroConfig | null;
  timer: TimerState | null;
  media: MediaState | null;
  roster: RosterEntry[];
  chat: ChatMessage[];
  playlist: PlaylistState;
  myBlocks: string[];
  myRole: number;
  connState: ConnState;

  // REST actions
  fetchMyRooms: (opts?: { forceRefresh?: boolean }) => Promise<void>;
  createRoom: (p: CreateStudyRoomPayload) => Promise<StudyRoomListItem | null>;
  updateRoom: (id: string, p: UpdateStudyRoomPayload) => Promise<boolean>;
  deleteRoom: (id: string) => Promise<boolean>;
  joinByCode: (code: string) => Promise<string | null>; // trả về roomId
  joinById: (id: string, inviteCode?: string) => Promise<string | null>;
  leaveRoom: (id: string) => Promise<boolean>;

  // Socket-driven mutations (gọi bởi useStudyRoomSocket)
  setConnState: (s: ConnState) => void;
  applySnapshot: (s: RoomSnapshot) => void;
  applyTimer: (timer: TimerState, config?: PomodoroConfig) => void;
  applyMedia: (media: MediaState) => void;
  applyPresence: (p: {
    userId: string;
    online: boolean;
    status: "studying" | "break" | null;
  }) => void;
  appendChat: (message: ChatMessage) => void;
  applyRole: (userId: string, role: number, isSelf?: boolean) => void;
  applyPlaylist: (playlist: PlaylistState) => void;
  applyBlocks: (blockedUserIds: string[]) => void;
  applyModerated: (p: {
    userId: string;
    isBanned?: boolean;
    isMuted?: boolean;
  }) => void;
  resetRoom: () => void;
}

// Selector: chat đã lọc bỏ tin của người mình đã chặn.
// Cache theo tham chiếu [chat, myBlocks] để trả về CÙNG một mảng khi hai
// nguồn này không đổi — nếu không, filter cấp mảng mới mỗi lần gọi sẽ phá
// cơ chế bailout bằng Object.is của Zustand và khiến ChatPanel re-render trên
// mọi tick store (presence/media/timer…).
let visibleChatCache: {
  chat: ChatMessage[];
  blocks: string[];
  result: ChatMessage[];
} | null = null;

export const selectVisibleChat = (s: StudyRoomStore): ChatMessage[] => {
  if (s.myBlocks.length === 0) return s.chat;
  if (
    visibleChatCache &&
    visibleChatCache.chat === s.chat &&
    visibleChatCache.blocks === s.myBlocks
  ) {
    return visibleChatCache.result;
  }
  const blocked = new Set(s.myBlocks);
  const result = s.chat.filter((m) => !blocked.has(m.userId));
  visibleChatCache = { chat: s.chat, blocks: s.myBlocks, result };
  return result;
};

export const useStudyRoomStore = create<StudyRoomStore>((set, get) => ({
  myRooms: [],
  loadingMine: false,
  room: null,
  config: null,
  timer: null,
  media: null,
  roster: [],
  chat: [],
  playlist: EMPTY_PLAYLIST,
  myBlocks: [],
  myRole: 0,
  connState: "idle",

  async fetchMyRooms(opts) {
    if (!opts?.forceRefresh) {
      const cached = storeCache.get<StudyRoomListItem[]>(
        MY_ROOMS_KEY,
        CacheTTL.FIVE_MINUTES,
      );
      if (cached) {
        set({ myRooms: cached });
        return;
      }
    }
    set({ loadingMine: true });
    try {
      const rooms = await getMyStudyRoomsApi();
      storeCache.set(MY_ROOMS_KEY, rooms);
      set({ myRooms: rooms });
    } finally {
      set({ loadingMine: false });
    }
  },

  async createRoom(p) {
    const room = await createStudyRoomApi(p);
    storeCache.invalidate(MY_ROOMS_KEY);
    await get().fetchMyRooms({ forceRefresh: true });
    return room;
  },

  async updateRoom(id, p) {
    await updateStudyRoomApi(id, p);
    storeCache.invalidate(MY_ROOMS_KEY);
    await get().fetchMyRooms({ forceRefresh: true });
    return true;
  },

  async deleteRoom(id) {
    await deleteStudyRoomApi(id);
    storeCache.invalidate(MY_ROOMS_KEY);
    set({ myRooms: get().myRooms.filter((r) => r.id !== id) });
    return true;
  },

  async joinByCode(code) {
    const room = await joinStudyRoomByCodeApi(code);
    storeCache.invalidate(MY_ROOMS_KEY);
    await get().fetchMyRooms({ forceRefresh: true });
    return room?.id ?? null;
  },

  async joinById(id, inviteCode) {
    const room = await joinStudyRoomByIdApi(id, inviteCode);
    storeCache.invalidate(MY_ROOMS_KEY);
    await get().fetchMyRooms({ forceRefresh: true });
    return room?.id ?? id;
  },

  async leaveRoom(id) {
    await leaveStudyRoomApi(id);
    storeCache.invalidate(MY_ROOMS_KEY);
    set({ myRooms: get().myRooms.filter((r) => r.id !== id) });
    return true;
  },

  setConnState(s) {
    set({ connState: s });
  },

  applySnapshot(s) {
    set({
      room: s.room,
      config: s.config,
      timer: s.timer,
      media: s.media,
      roster: s.roster,
      chat: s.chat,
      playlist: s.playlist ?? EMPTY_PLAYLIST,
      myBlocks: s.myBlocks ?? [],
      myRole: s.myRole,
    });
  },

  applyTimer(timer, config) {
    set((st) => ({ timer, config: config ?? st.config }));
  },

  applyMedia(media) {
    set({ media });
  },

  applyPresence(p) {
    set((st) => {
      const exists = st.roster.some((r) => r.userId === p.userId);
      const roster = exists
        ? st.roster.map((r) =>
            r.userId === p.userId
              ? { ...r, online: p.online, status: p.status }
              : r,
          )
        : [
            ...st.roster,
            {
              userId: p.userId,
              name: null,
              avatar: null,
              role: 0,
              online: p.online,
              status: p.status,
              isBanned: false,
              isMuted: false,
            },
          ];
      return { roster };
    });
  },

  appendChat(message) {
    set((st) => ({ chat: [...st.chat, message].slice(-200) }));
  },

  applyRole(userId, role, isSelf) {
    set((st) => ({
      roster: st.roster.map((r) => (r.userId === userId ? { ...r, role } : r)),
      myRole: isSelf ? role : st.myRole,
    }));
  },

  applyPlaylist(playlist) {
    set({ playlist });
  },

  applyBlocks(blockedUserIds) {
    set({ myBlocks: blockedUserIds });
  },

  applyModerated(p) {
    set((st) => {
      // Bị ban → rơi khỏi roster; các thay đổi khác cập nhật cờ tại chỗ.
      if (p.isBanned) {
        return { roster: st.roster.filter((r) => r.userId !== p.userId) };
      }
      return {
        roster: st.roster.map((r) =>
          r.userId === p.userId
            ? {
                ...r,
                isBanned: p.isBanned ?? r.isBanned,
                isMuted: p.isMuted ?? r.isMuted,
              }
            : r,
        ),
      };
    });
  },

  resetRoom() {
    set({
      room: null,
      config: null,
      timer: null,
      media: null,
      roster: [],
      chat: [],
      playlist: EMPTY_PLAYLIST,
      myBlocks: [],
      myRole: 0,
      connState: "idle",
    });
  },
}));
