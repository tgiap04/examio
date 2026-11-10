import { describe, expect, it } from "vitest";
import { canLoadExamStats } from "./exam-stats-gate";

describe("canLoadExamStats", () => {
  it("requires access and exam:take", () => {
    expect(canLoadExamStats(true, true)).toBe(true);
    expect(canLoadExamStats(true, false)).toBe(false);
    expect(canLoadExamStats(false, true)).toBe(false);
  });
});
