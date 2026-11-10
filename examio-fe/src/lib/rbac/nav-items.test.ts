import { describe, expect, it } from "vitest";
import { ADMIN_NAV_PERMISSIONS, WORD_FAMILY_ACTION_PERMISSIONS, filterAdminNav, filterNav } from "./nav-items";
import { makeCan, makeCanAny } from "./can";
import { permissionsForRoles } from "./test-helpers";

const labels = (perms: ReturnType<typeof permissionsForRoles>, pageMap = {}) =>
  filterNav(makeCan(perms), pageMap).map((i) => i.label);

describe("filterNav", () => {
  it("shows a STUDENT exactly the student items", () => {
    expect(labels(permissionsForRoles(["STUDENT"]))).toEqual([
      "Từ vựng tiếng Anh",
      "Tài liệu của tôi",
      "Bài thi của tôi",
      "Phòng học chung",
      "Lịch sử",
    ]);
  });

  it("shows a TEACHER exactly the teacher items", () => {
    expect(labels(permissionsForRoles(["TEACHER"]))).toEqual([
      "Công cụ AI",
      "Từ vựng tiếng Anh",
      "Quản lý Đề thi",
      "Quản lý Flashcard",
      "Quản lý Phòng thi",
      "Phòng học chung",
      "Lịch sử",
    ]);
  });

  it("adds the admin item only with admin:access", () => {
    expect(labels(permissionsForRoles(["STUDENT"]))).not.toContain("Trang quản trị");
    expect(labels(permissionsForRoles(["TEACHER"]))).not.toContain("Trang quản trị");
    expect(labels(permissionsForRoles(["STUDENT", "SYSTEM_ADMIN"]))).toContain("Trang quản trị");
  });

  it("hides an item whose page flag is false", () => {
    expect(labels(permissionsForRoles(["TEACHER"]), { "ai-tool": false })).not.toContain("Công cụ AI");
  });

  it("points History at the exam tab for a STUDENT and at the hub for a TEACHER", () => {
    const hrefOf = (roles: Parameters<typeof permissionsForRoles>[0]) =>
      filterNav(makeCan(permissionsForRoles(roles)), {}).find((i) => i.id === "history")?.href;
    expect(hrefOf(["STUDENT"])).toBe("/k/history/exam");
    expect(hrefOf(["TEACHER"])).toBe("/k/history");
  });
});

describe("filterAdminNav", () => {
  it("keeps only the admin routes whose permission is held", () => {
    const can = makeCan(["admin:access", "stats:read", "role:assign"]);
    expect(filterAdminNav(can).map((i) => i)).toEqual(["/admin", "/admin/stats", "/admin/roles"]);
  });

  it("covers every admin child route", () => {
    expect(Object.keys(ADMIN_NAV_PERMISSIONS)).toHaveLength(9);
  });
});

describe("word-family actions", () => {
  const visible = (roles: Parameters<typeof permissionsForRoles>[0]) => {
    const can = makeCan(permissionsForRoles(roles));
    return {
      generate: can(WORD_FAMILY_ACTION_PERMISSIONS.generate),
      save: can(WORD_FAMILY_ACTION_PERMISSIONS.save),
      toFlashcard: can(WORD_FAMILY_ACTION_PERMISSIONS.toFlashcard),
    };
  };

  it("a teacher sees generate, save and to-flashcard", () => {
    expect(visible(["TEACHER"])).toEqual({ generate: true, save: true, toFlashcard: true });
  });

  it("a student sees save only", () => {
    expect(visible(["STUDENT"])).toEqual({ generate: false, save: true, toFlashcard: false });
  });
});

describe("makeCanAny", () => {
  it("is true when at least one permission is held and false for an empty list", () => {
    const canAny = makeCanAny(makeCan(["exam:take"]));
    expect(canAny(["ai:generate", "exam:take"])).toBe(true);
    expect(canAny(["ai:generate"])).toBe(false);
    expect(canAny([])).toBe(false);
  });
});
