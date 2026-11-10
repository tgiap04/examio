import { describe, expect, it } from "vitest";
import { groupPermissions, PERMISSION_GROUPS } from "./permission-groups";

describe("permission groups", () => {
  it("has no wallet group and lists no money permission", () => {
    const keys = PERMISSION_GROUPS.flatMap((g) => g.keys);
    expect(PERMISSION_GROUPS.map((g) => g.id)).not.toContain("wallet");
    expect(keys).not.toContain("wallet:use");
    expect(keys).not.toContain("subscription:manage");
    expect(keys).not.toContain("finance:admin");
  });
});

describe("groupPermissions", () => {
  it("puts a permission missing from every group into other", () => {
    const groups = groupPermissions(["ai:generate", "brand:new"]);
    expect(groups).toEqual([
      { id: "ai", permissions: ["ai:generate"] },
      { id: "other", permissions: ["brand:new"] },
    ]);
  });
});
