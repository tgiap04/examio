/**
 * Danh sách trang có thể bật/tắt cho user (đồng bộ với backend
 * `@examio/common` TOGGLEABLE_PAGE_KEYS). Không import cross-package nên
 * giữ bản sao ở đây; hai bên phải thay đổi cùng lúc khi thêm/bớt trang.
 */
export const TOGGLEABLE_PAGE_KEYS = [
  "ai-tool",
  "word-family",
  "my-materials",
  "my-exams",
  "manage-exam",
  "flash-card",
  "manage-exam-room",
  "history",
  "study-room",
] as const;

export type PageKey = (typeof TOGGLEABLE_PAGE_KEYS)[number];

export function isPageKey(value: string): value is PageKey {
  return (TOGGLEABLE_PAGE_KEYS as readonly string[]).includes(value);
}
