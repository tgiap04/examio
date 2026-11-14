import type { useStudyRoomSocket } from "@/hooks/useStudyRoomSocket";

// Kiểu của bộ hành động socket trả về từ hook — dùng chung cho các panel.
export type StudyRoomActions = ReturnType<typeof useStudyRoomSocket>;

export const DEFAULT_POMODORO = {
  workMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
};
