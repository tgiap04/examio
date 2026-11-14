import { describe, expect, it } from "vitest";
import {
  banErrorKey,
  canBanRow,
  canEditRow,
  canToggleAdmin,
  consequenceKeys,
  errorMessageKey,
} from "./role-change-rules";

const row = (over: Partial<Parameters<typeof canEditRow>[0]> = {}) => ({
  id: "u2",
  role: "STUDENT" as const,
  isSystemAdmin: false,
  ...over,
});

describe("canEditRow / canToggleAdmin", () => {
  it("locks the caller's own row", () => {
    expect(canEditRow(row({ id: "me" }), "me", 2)).toEqual({ editable: false, reasonKey: "roles.guard.self" });
  });

  it("locks the switch of the last active admin", () => {
    const guard = canToggleAdmin(row({ isSystemAdmin: true }), "me", 1);
    expect(guard).toEqual({ editable: false, reasonKey: "roles.guard.lastAdmin" });
  });

  it("allows a non-last admin", () => {
    expect(canToggleAdmin(row({ isSystemAdmin: true }), "me", 2).editable).toBe(true);
  });
});

describe("canBanRow", () => {
  it("refuses self and the last admin, allows others", () => {
    expect(canBanRow({ id: "me", isSystemAdmin: false }, "me", 3).allowed).toBe(false);
    expect(canBanRow({ id: "u2", isSystemAdmin: true }, "me", 1)).toEqual({
      allowed: false,
      reasonKey: "users.ban.lastAdmin",
    });
    expect(canBanRow({ id: "u2", isSystemAdmin: false }, "me", 1).allowed).toBe(true);
  });
});

describe("consequenceKeys", () => {
  it("returns a consequence per direction plus the delay note", () => {
    expect(consequenceKeys({ kind: "role", to: "TEACHER" })).toEqual([
      "roles.dialog.consequence.toTeacher",
      "roles.dialog.delayNote",
    ]);
    expect(consequenceKeys({ kind: "role", to: "STUDENT" })[0]).toBe("roles.dialog.consequence.toStudent");
    expect(consequenceKeys({ kind: "admin", grant: true })[0]).toBe("roles.dialog.consequence.grantAdmin");
    expect(consequenceKeys({ kind: "admin", grant: false })[0]).toBe("roles.dialog.consequence.revokeAdmin");
  });
});

describe("errorMessageKey / banErrorKey", () => {
  it("maps LAST_SYSTEM_ADMIN and other 409s to their keys and asks for a refetch", () => {
    expect(errorMessageKey(409, "LAST_SYSTEM_ADMIN")).toEqual({ key: "roles.errors.lastAdmin", refetch: true });
    expect(errorMessageKey(409, "SOMETHING")).toEqual({ key: "roles.errors.conflict", refetch: true });
    expect(banErrorKey(409, "LAST_SYSTEM_ADMIN")).toEqual({ key: "users.ban.lastAdmin", refetch: true });
  });

  it("falls back to the default key for an unknown error", () => {
    expect(errorMessageKey(500, undefined)).toEqual({ key: "roles.errors.default", refetch: false });
    expect(banErrorKey(500, undefined).key).toBe("users.actions.banError");
  });
});
