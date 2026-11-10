import type { Permission } from "@/types/permissions.generated";
import type { PageKey } from "@/lib/page-keys";
import { makeCanAny, type CanFn } from "./can";

export interface NavConfigItem {
  id: string;
  href: string;
  /** Used instead of `href` when the caller lacks `altHref.unless`. */
  altHref?: { unless: Permission; href: string };
  label: string;
  shortLabel: string;
  /** Visible when ANY of these is held. */
  anyOf: readonly Permission[];
  pageKey?: PageKey;
}

export interface VisibleNavItem {
  id: string;
  href: string;
  label: string;
  shortLabel: string;
}

export const NAV_ITEMS: readonly NavConfigItem[] = [
  { id: "ai-tool", href: "/k/ai-tool", label: "Công cụ AI", shortLabel: "AI", anyOf: ["ai:generate"], pageKey: "ai-tool" },
  { id: "word-family", href: "/k/word-family", label: "Từ vựng tiếng Anh", shortLabel: "Từ vựng", anyOf: ["word_family:read"], pageKey: "word-family" },
  { id: "my-materials", href: "/k/my-materials", label: "Tài liệu của tôi", shortLabel: "Tài liệu", anyOf: ["flashcard:study"], pageKey: "my-materials" },
  { id: "my-exams", href: "/k/my-exams", label: "Bài thi của tôi", shortLabel: "Bài thi", anyOf: ["exam:take"], pageKey: "my-exams" },
  { id: "manage-exam", href: "/k/manage-exam", label: "Quản lý Đề thi", shortLabel: "Đề thi", anyOf: ["quizset:manage"], pageKey: "manage-exam" },
  { id: "flash-card", href: "/k/flash-card", label: "Quản lý Flashcard", shortLabel: "Flashcard", anyOf: ["flashcardset:manage"], pageKey: "flash-card" },
  { id: "manage-exam-room", href: "/k/manage-exam-room", label: "Quản lý Phòng thi", shortLabel: "Phòng thi", anyOf: ["exam_room:manage"], pageKey: "manage-exam-room" },
  { id: "study-room", href: "/k/study-room", label: "Phòng học chung", shortLabel: "Học chung", anyOf: ["study_room:join"], pageKey: "study-room" },
  {
    id: "history",
    href: "/k/history",
    altHref: { unless: "ai:generate", href: "/k/history/exam" },
    label: "Lịch sử",
    shortLabel: "Lịch sử",
    anyOf: ["ai:generate", "exam:take"],
    pageKey: "history",
  },
  { id: "admin", href: "/admin", label: "Trang quản trị", shortLabel: "Admin", anyOf: ["admin:access"] },
];

/** Permission + page flag filter (a page flag is default-on: only `false` hides). */
export function filterNav(can: CanFn, pageMap: Partial<Record<PageKey, boolean>>): VisibleNavItem[] {
  const canAny = makeCanAny(can);
  return NAV_ITEMS.filter((item) => canAny(item.anyOf) && !(item.pageKey && pageMap[item.pageKey] === false)).map(
    (item) => ({
      id: item.id,
      href: item.altHref && !can(item.altHref.unless) ? item.altHref.href : item.href,
      label: item.label,
      shortLabel: item.shortLabel,
    }),
  );
}

/** Admin console route -> permission (route guard and nav share this table). */
export const ADMIN_NAV_PERMISSIONS: Readonly<Record<string, Permission>> = {
  "/admin": "stats:read",
  "/admin/stats": "stats:read",
  "/admin/users": "user:manage",
  "/admin/roles": "role:assign",
  "/admin/logs": "logs:read",
  "/admin/audit": "audit:read",
  "/admin/word-family": "word_family:admin",
  "/admin/page-config": "page_config:manage",
};

/** Admin routes the caller may open, in table order. */
export function filterAdminNav(can: CanFn): string[] {
  return Object.entries(ADMIN_NAV_PERMISSIONS)
    .filter(([, permission]) => can(permission))
    .map(([path]) => path);
}

/** Word-family buttons and the permission each one needs. */
export const WORD_FAMILY_ACTION_PERMISSIONS = {
  generate: "word_family:generate",
  save: "word_family:save",
  toFlashcard: "flashcardset:manage",
} as const satisfies Record<string, Permission>;
