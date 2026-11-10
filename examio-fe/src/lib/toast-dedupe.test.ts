import { describe, expect, it, vi } from "vitest";
import { createToastDeduper } from "./toast-dedupe";

describe("createToastDeduper", () => {
  it("shows an identical toast only once inside the window and hands back the first handle", () => {
    let t = 0;
    const run = createToastDeduper<string>(3000, () => t);
    const create = vi.fn(() => "handle");
    expect(run("error:denied", create)).toBe("handle");
    t = 100;
    expect(run("error:denied", create)).toBe("handle");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("shows it again once the window has passed", () => {
    let t = 0;
    const run = createToastDeduper<number>(3000, () => t);
    const create = vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(2);
    run("k", create);
    t = 3000;
    expect(run("k", create)).toBe(2);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("different keys never suppress each other", () => {
    const run = createToastDeduper<string>(3000, () => 0);
    const create = vi.fn(() => "h");
    run("error:a", create);
    run("error:b", create);
    run("success:a", create);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("forgets expired keys (no unbounded growth)", () => {
    let t = 0;
    const run = createToastDeduper<string>(1000, () => t);
    for (let i = 0; i < 50; i++) run(`k${i}`, () => "h");
    t = 5000;
    run("fresh", () => "h");
    expect(run.size()).toBe(1);
  });
});
