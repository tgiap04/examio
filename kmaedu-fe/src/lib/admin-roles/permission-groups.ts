/**
 * Groups of the permission catalog for the read-only matrix. The catalog
 * itself comes from the API (`GET /admin/roles`); a key not listed here lands
 * in "other" so a new backend permission never disappears from the screen.
 */
export const PERMISSION_GROUPS: ReadonlyArray<{ id: string; keys: readonly string[] }> = [
  {
    id: "learning",
    keys: [
      "flashcard:study",
      "quiz:practice",
      "exam:take",
      "study_room:join",
      "study_room:create",
      "word_family:read",
      "word_family:save",
      "word_family:generate",
    ],
  },
  { id: "content", keys: ["quizset:manage", "flashcardset:manage", "content:share", "user:search", "document:upload"] },
  { id: "exams", keys: ["exam_room:manage", "exam_session:manage", "exam_result:view"] },
  { id: "ai", keys: ["ai:generate", "ai_chat:use"] },
  {
    id: "admin",
    keys: [
      "admin:access",
      "user:manage",
      "role:assign",
      "stats:read",
      "logs:read",
      "audit:read",
      "page_config:manage",
      "word_family:admin",
    ],
  },
];

/** `quizset:manage` -> `roles.perm.quizset_manage` (i18next uses `:` as the namespace separator). */
export const permissionI18nKey = (permission: string): string =>
  `roles.perm.${permission.replace(/:/g, "_")}`;

export interface PermissionGroup {
  id: string;
  permissions: string[];
}

/** Catalog order inside each group; unknown keys go to a trailing "other" group. */
export function groupPermissions(catalog: readonly string[]): PermissionGroup[] {
  const known = new Set(PERMISSION_GROUPS.flatMap((g) => g.keys));
  const present = new Set(catalog);
  const groups = PERMISSION_GROUPS.map((g) => ({
    id: g.id,
    permissions: g.keys.filter((k) => present.has(k)),
  }));
  const other = catalog.filter((k) => !known.has(k));
  if (other.length) groups.push({ id: "other", permissions: other });
  return groups.filter((g) => g.permissions.length > 0);
}
