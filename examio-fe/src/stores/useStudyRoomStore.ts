import { create } from "zustand";
import {
  createStudyRoomApi,
  getMyStudyRoomsApi,
  joinStudyRoomByCodeApi,
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
  PomodoroConfig,
  RoomSnapshot,
  RosterEntry,
  StudyRoomListItem,
  StudyRoomSummary,
  TimerState,
} from "@/types/studyRoom";

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
  myRole: number;
  connState: ConnState;

  // REST actions
  fetchMyRooms: (opts?: { forceRefresh?: boolean }) => Promise<void>;
  createRoom: (p: CreateStudyRoomPayload) => Promise<StudyRoomListItem | null>;
  updateRoom: (id: string, p: UpdateStudyRoomPayload) => Promise<boolean>;
  deleteRoom: (id: string) => Promise<boolean>;
  joinByCode: (code: string) => Promise<string | null>; // trả về roomId
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
  resetRoom: () => void;
}

export const useStudyRoomStore = create<StudyRoomStore>((set, get) => ({
  myRooms: [],
  loadingMine: false,
  room: null,
  config: null,
  timer: null,
  media: null,
  roster: [],
  chat: [],
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

  resetRoom() {
    set({
      room: null,
      config: null,
      timer: null,
      media: null,
      roster: [],
      chat: [],
      myRole: 0,
      connState: "idle",
    });
  },
}));
