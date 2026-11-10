import { describe, expect, it } from "vitest";
import { buildAutosavePayload, resumeIndex, toggleMarked } from "./progress";

describe("buildAutosavePayload", () => {
  it("holds only answers, currentIndex, markedQuestions and timeSpentSeconds", () => {
    const payload = buildAutosavePayload({
      answers: { q1: "a" },
      currentIndex: 2,
      markedQuestions: ["q1", "q1", "q2"],
      timeSpentSeconds: 12.9,
      // @ts-expect-error extra keys must never reach the server body
      score: 10,
    });
    expect(Object.keys(payload).sort()).toEqual(["answers", "currentIndex", "markedQuestions", "timeSpentSeconds"]);
    expect(payload.markedQuestions).toEqual(["q1", "q2"]);
    expect(payload.timeSpentSeconds).toBe(12);
  });

  it("clamps negative values to zero", () => {
    const payload = buildAutosavePayload({ answers: {}, currentIndex: -3, markedQuestions: [], timeSpentSeconds: -1 });
    expect(payload.currentIndex).toBe(0);
    expect(payload.timeSpentSeconds).toBe(0);
  });
});

describe("resumeIndex", () => {
  it("returns the stored index inside the question range", () => {
    expect(resumeIndex(3, 10)).toBe(3);
  });

  it("clamps an index past the end to the last question", () => {
    expect(resumeIndex(99, 10)).toBe(9);
  });

  it("returns 0 for an empty attempt", () => {
    expect(resumeIndex(5, 0)).toBe(0);
    expect(resumeIndex(Number.NaN, 4)).toBe(0);
  });
});

describe("toggleMarked", () => {
  it("adds then removes a question id", () => {
    expect(toggleMarked([], "q1")).toEqual(["q1"]);
    expect(toggleMarked(["q1"], "q1")).toEqual([]);
  });
});
