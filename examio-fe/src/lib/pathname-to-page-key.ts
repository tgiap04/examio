import type { PageKey } from "./page-keys";

/**
 * Suy ra pageKey từ pathname hiện tại, hoặc null nếu không phải trang
 * toggle-able. Dùng bởi usePageConfigSse để biết có cần redirect khi trang
 * đang xem bị admin tắt realtime.
 *
 * Lưu ý thứ tự: các prefix dài/đặc thù phải check trước prefix ngắn hơn
 * (vd "/k/manage-exam-room" trước "/k/manage-exam").
 */
export function pathnameToPageKey(pathname: string): PageKey | null {
  if (pathname.startsWith("/k/ai-tool")) return "ai-tool";
  if (pathname.startsWith("/k/word-family")) return "word-family";
  if (pathname.startsWith("/k/my-materials")) return "my-materials";
  if (pathname.startsWith("/k/my-exams")) return "my-exams";
  if (pathname.startsWith("/k/manage-exam-room")) return "manage-exam-room";
  if (pathname.startsWith("/k/manage-exam")) return "manage-exam";
  if (pathname.startsWith("/k/manage-quiz-set")) return "manage-exam";
  if (pathname.startsWith("/k/manage-flashcard-set")) return "flash-card";
  if (pathname.startsWith("/k/flash-card")) return "flash-card";
  if (pathname.startsWith("/k/history")) return "history";
  return null;
}
