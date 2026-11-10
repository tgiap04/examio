import { api } from "./api";
import {
  StudyRoomListItem,
  RoomSnapshot,
  LeaderboardEntry,
} from "@/types/studyRoom";

export type CreateStudyRoomPayload = {
  name: string;
  description?: string;
  workMinutes?: number;
  breakMinutes?: number;
  longBreakMinutes?: number;
  cyclesBeforeLongBreak?: number;
  maxParticipants?: number;
  accessType?: number;
};

export type UpdateStudyRoomPayload = Partial<CreateStudyRoomPayload> & {
  isActive?: boolean;
  accessType?: number;
  whitelist?: string[];
  playlistAddPermission?: number;
};

export async function createStudyRoomApi(payload: CreateStudyRoomPayload) {
  const res = await api.post("/studyrooms", payload);
  return res.data as StudyRoomListItem;
}

export async function getMyStudyRoomsApi() {
  const res = await api.get("/studyrooms/mine");
  return res.data as StudyRoomListItem[];
}

export async function joinStudyRoomByCodeApi(inviteCode: string) {
  const res = await api.post("/studyrooms/join", { inviteCode });
  return res.data as RoomSnapshot["room"] & { members?: unknown[] };
}

// Vào phòng bằng id: public/whitelist không cần mã; code truyền inviteCode.
export async function joinStudyRoomByIdApi(id: string, inviteCode?: string) {
  const res = await api.post(`/studyrooms/${id}/join`, { inviteCode });
  return res.data as RoomSnapshot["room"] & { members?: unknown[] };
}

export async function getStudyRoomDetailApi(id: string) {
  const res = await api.get(`/studyrooms/${id}`);
  return res.data as StudyRoomListItem & { members: unknown[] };
}

export async function updateStudyRoomApi(
  id: string,
  payload: UpdateStudyRoomPayload,
) {
  const res = await api.put(`/studyrooms/${id}`, payload);
  return res.data as StudyRoomListItem;
}

export async function deleteStudyRoomApi(id: string) {
  const res = await api.delete(`/studyrooms/${id}`);
  return res.data as { success: boolean };
}

export async function leaveStudyRoomApi(id: string) {
  const res = await api.post(`/studyrooms/${id}/leave`);
  return res.data as { success: boolean };
}

export async function regenerateStudyRoomCodeApi(id: string) {
  const res = await api.post(`/studyrooms/${id}/regenerate-code`);
  return res.data as { inviteCode: string };
}

export async function getStudyRoomLeaderboardApi(id: string) {
  const res = await api.get(`/studyrooms/${id}/leaderboard`);
  return res.data as LeaderboardEntry[];
}
