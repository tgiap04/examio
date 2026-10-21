/**
 * Pure rules of the /admin/roles screen (UX only: auth enforces the same
 * rules and answers 403/409, which `errorMessageKey` turns into messages).
 * Phase 09 adds the unit tests (first FE test runner).
 */

export type BaseRole = "STUDENT" | "TEACHER";

export interface RoleRowLike {
  id: string;
  role: BaseRole;
  isSystemAdmin: boolean;
  isBanned?: boolean;
}

export interface Guard {
  /** false = the control is disabled and `reasonKey` explains why. */
  editable: boolean;
  reasonKey: string | null;
}

const ALLOWED: Guard = { editable: true, reasonKey: null };

/** Base-role Select: only the caller's own row is locked. */
export function canEditRow(
  row: RoleRowLike,
  currentUserId: string | null | undefined,
  _systemAdminCount: number,
): Guard {
  if (currentUserId != null && String(currentUserId) === row.id) {
    return { editable: false, reasonKey: "roles.guard.self" };
  }
  return ALLOWED;
}

/** SYSTEM_ADMIN Switch: own row, and the only remaining admin, are locked. */
export function canToggleAdmin(
  row: RoleRowLike,
  currentUserId: string | null | undefined,
  systemAdminCount: number,
): Guard {
  const base = canEditRow(row, currentUserId, systemAdminCount);
  if (!base.editable) return base;
  // `systemAdminCount` counts ACTIVE admins: a banned admin is not what the last-admin rule protects.
  if (row.isSystemAdmin && !row.isBanned && systemAdminCount <= 1) {
    return { editable: false, reasonKey: "roles.guard.lastAdmin" };
  }
  return ALLOWED;
}

export interface BanGuard {
  allowed: boolean;
  reasonKey: string | null;
}

/** "Khóa" on /admin/users: never self, never the last active admin. */
export function canBanRow(
  row: Pick<RoleRowLike, "id" | "isSystemAdmin">,
  currentUserId: string | null | undefined,
  adminCount: number,
): BanGuard {
  if (currentUserId != null && String(currentUserId) === row.id) {
    return { allowed: false, reasonKey: "users.ban.self" };
  }
  if (row.isSystemAdmin && adminCount <= 1) {
    return { allowed: false, reasonKey: "users.ban.lastAdmin" };
  }
  return { allowed: true, reasonKey: null };
}

export type RoleChange =
  | { kind: "role"; to: BaseRole }
  | { kind: "admin"; grant: boolean };

/** i18n keys of the consequence line and the always-shown delay note. */
export function consequenceKeys(change: RoleChange): string[] {
  const consequence =
    change.kind === "role"
      ? change.to === "TEACHER"
        ? "roles.dialog.consequence.toTeacher"
        : "roles.dialog.consequence.toStudent"
      : change.grant
        ? "roles.dialog.consequence.grantAdmin"
        : "roles.dialog.consequence.revokeAdmin";
  return [consequence, "roles.dialog.delayNote"];
}

/** Demotion and revoke are destructive: the confirm button is `danger`. */
export function isDestructive(change: RoleChange): boolean {
  return change.kind === "role" ? change.to === "STUDENT" : !change.grant;
}

export interface ErrorKeyResult {
  key: string;
  /** The list (and `systemAdminCount`) is stale: close the dialog and refetch. */
  refetch: boolean;
}

/** Role / admin-flag change failures (`status`/`code` of the API envelope). */
export function errorMessageKey(status: number | undefined, code: string | undefined): ErrorKeyResult {
  switch (code) {
    case "CANNOT_CHANGE_OWN_ROLE":
      return { key: "roles.errors.self", refetch: false };
    case "LAST_SYSTEM_ADMIN":
      return { key: "roles.errors.lastAdmin", refetch: true };
    case "USER_NOT_FOUND":
      return { key: "roles.errors.notFound", refetch: true };
    case "PERMISSION_DENIED":
      return { key: "roles.errors.forbidden", refetch: false };
    case "ROLE_CHANGE_CONFLICT":
      return { key: "roles.errors.conflict", refetch: true };
    default:
      return status === 409
        ? { key: "roles.errors.conflict", refetch: true }
        : { key: "roles.errors.default", refetch: false };
  }
}

/** Ban / unban failures on /admin/users. */
export function banErrorKey(status: number | undefined, code: string | undefined): ErrorKeyResult {
  if (code === "LAST_SYSTEM_ADMIN") return { key: "users.ban.lastAdmin", refetch: true };
  if (code === "CANNOT_CHANGE_OWN_STATUS") return { key: "users.ban.self", refetch: false };
  if (status === 409) return { key: "roles.errors.conflict", refetch: true };
  return { key: "users.actions.banError", refetch: false };
}
