import { describe, expect, it } from "vitest";
import { resolveLandingPath } from "./landing-path";
import { permissionsForRoles } from "./test-helpers";

const student = { role: "STUDENT" as const, isSystemAdmin: false, permissions: permissionsForRoles(["STUDENT"]) };
const teacher = { role: "TEACHER" as const, isSystemAdmin: false, permissions: permissionsForRoles(["TEACHER"]) };
const studentAdmin = {
  role: "STUDENT" as const,
  isSystemAdmin: true,
  permissions: permissionsForRoles(["STUDENT", "SYSTEM_ADMIN"]),
};
const teacherAdmin = {
  role: "TEACHER" as const,
  isSystemAdmin: true,
  permissions: permissionsForRoles(["TEACHER", "SYSTEM_ADMIN"]),
};

describe("resolveLandingPath", () => {
  it("sends a TEACHER to the AI tool", () => {
    expect(resolveLandingPath({ ...teacher, pageMap: {} })).toBe("/k/ai-tool");
  });

  it("sends a STUDENT to my materials", () => {
    expect(resolveLandingPath({ ...student, pageMap: {} })).toBe("/k/my-materials");
  });

  it("sends an admin-only account (STUDENT + SYSTEM_ADMIN) to /admin", () => {
    expect(resolveLandingPath({ ...studentAdmin, pageMap: {} })).toBe("/admin");
  });

  it("keeps a TEACHER who is also admin on the teacher landing", () => {
    expect(resolveLandingPath({ ...teacherAdmin, pageMap: {} })).toBe("/k/ai-tool");
  });

  it("lets a safe `from` param win over the role landing", () => {
    expect(resolveLandingPath({ ...student, pageMap: {}, from: "/k/study-room" })).toBe("/k/study-room");
  });

  it("ignores an unsafe `from` (open redirect)", () => {
    expect(resolveLandingPath({ ...student, pageMap: {}, from: "https://evil.example" })).toBe("/k/my-materials");
    expect(resolveLandingPath({ ...student, pageMap: {}, from: "//evil.example" })).toBe("/k/my-materials");
  });

  it("falls to the first visible sidebar item when the landing page flag is off", () => {
    expect(resolveLandingPath({ ...teacher, pageMap: { "ai-tool": false } })).toBe("/k/word-family");
    expect(resolveLandingPath({ ...student, pageMap: { "my-materials": false } })).toBe("/k/word-family");
  });

  it("falls to the profile page when nothing is visible", () => {
    const pageMap = {
      "ai-tool": false,
      "word-family": false,
      "my-materials": false,
      "my-exams": false,
      "study-room": false,
      history: false,
    };
    expect(resolveLandingPath({ ...student, pageMap })).toBe("/k/profile");
  });
});
