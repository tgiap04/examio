import { describe, expect, it } from "vitest";
import { DELETED_USER_LABEL, displayUserInitial, displayUserName } from "./display-user-name";

describe("displayUserName", () => {
  it("falls back to the placeholder for a null/undefined user (degraded auth or deleted account)", () => {
    expect(displayUserName(null)).toBe(DELETED_USER_LABEL);
    expect(displayUserName(undefined)).toBe(DELETED_USER_LABEL);
    expect(DELETED_USER_LABEL).toBe("Người dùng đã xóa");
  });

  it("prefers name, then username", () => {
    expect(displayUserName({ name: "An", username: "an01" })).toBe("An");
    expect(displayUserName({ name: null, username: "an01" })).toBe("an01");
    expect(displayUserName({ name: "  ", username: "an01" })).toBe("an01");
  });

  it("uses a custom fallback when the user has neither", () => {
    expect(displayUserName({ name: null }, "Ẩn danh")).toBe("Ẩn danh");
  });
});

describe("displayUserInitial", () => {
  it("returns an uppercase first letter of the display name", () => {
    expect(displayUserInitial({ name: "an" })).toBe("A");
    expect(displayUserInitial(null)).toBe("N");
  });
});
