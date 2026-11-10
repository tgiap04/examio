import { describe, expect, it, vi } from "vitest";
import { singleFlight, probeSession, type SessionProbeDeps } from "./session-probe";

const http = (status: number, code?: string) => Object.assign(new Error(`http ${status}`), { status, code });

function deps(overrides: Partial<SessionProbeDeps<string>> = {}) {
  const d = {
    fetchMe: vi.fn<() => Promise<string | null>>().mockResolvedValue("me"),
    refresh: vi.fn<() => Promise<unknown>>().mockResolvedValue("token"),
    apply: vi.fn<(me: string) => void>(),
    clear: vi.fn<() => void>(),
    ...overrides,
  };
  return d;
}

describe("probeSession", () => {
  it("applies the user when /auth/me succeeds, without refreshing", async () => {
    const d = deps();
    await probeSession(d);
    expect(d.apply).toHaveBeenCalledWith("me");
    expect(d.refresh).not.toHaveBeenCalled();
    expect(d.clear).not.toHaveBeenCalled();
  });

  it("clears the session when /auth/me answers with nothing", async () => {
    const d = deps({ fetchMe: vi.fn().mockResolvedValue(null) });
    await probeSession(d);
    expect(d.clear).toHaveBeenCalledTimes(1);
  });

  it("refreshes once and retries /auth/me after a stale-token 401", async () => {
    const fetchMe = vi.fn().mockRejectedValueOnce(http(401, "TOKEN_STALE")).mockResolvedValueOnce("me2");
    const d = deps({ fetchMe });
    await probeSession(d);
    expect(d.refresh).toHaveBeenCalledTimes(1);
    expect(d.apply).toHaveBeenCalledWith("me2");
    expect(d.clear).not.toHaveBeenCalled();
  });

  it("clears on SESSION_REVOKED without calling refresh", async () => {
    const d = deps({ fetchMe: vi.fn().mockRejectedValue(http(401, "SESSION_REVOKED")) });
    await probeSession(d);
    expect(d.refresh).not.toHaveBeenCalled();
    expect(d.clear).toHaveBeenCalledTimes(1);
  });

  it("clears when the refresh itself is rejected with 401", async () => {
    const d = deps({
      fetchMe: vi.fn().mockRejectedValue(http(401)),
      refresh: vi.fn().mockRejectedValue(http(401)),
    });
    await probeSession(d);
    expect(d.clear).toHaveBeenCalledTimes(1);
  });

  it("keeps the session on a transient /auth/me failure (429, 5xx, network)", async () => {
    for (const err of [http(429), http(503), new Error("Network Error")]) {
      const d = deps({ fetchMe: vi.fn().mockRejectedValue(err) });
      await probeSession(d);
      expect(d.clear).not.toHaveBeenCalled();
      expect(d.refresh).not.toHaveBeenCalled();
    }
  });

  it("keeps the session when the refresh fails transiently", async () => {
    const d = deps({
      fetchMe: vi.fn().mockRejectedValue(http(401)),
      refresh: vi.fn().mockRejectedValue(http(503)),
    });
    await probeSession(d);
    expect(d.clear).not.toHaveBeenCalled();
  });

  it("clears when /auth/me is still 401 after a successful refresh", async () => {
    const d = deps({ fetchMe: vi.fn().mockRejectedValue(http(401, "TOKEN_STALE")) });
    await probeSession(d);
    expect(d.refresh).toHaveBeenCalledTimes(1);
    expect(d.clear).toHaveBeenCalledTimes(1);
  });

  it("keeps the session when the retried /auth/me fails transiently", async () => {
    const fetchMe = vi.fn().mockRejectedValueOnce(http(401)).mockRejectedValueOnce(http(500));
    const d = deps({ fetchMe });
    await probeSession(d);
    expect(d.clear).not.toHaveBeenCalled();
  });
});

describe("singleFlight", () => {
  it("shares one in-flight run between concurrent callers, then allows a new one", async () => {
    let release!: () => void;
    const task = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const run = singleFlight(task);
    const a = run();
    const b = run();
    expect(task).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([a, b]);
    const c = run();
    expect(task).toHaveBeenCalledTimes(2);
    release();
    await c;
  });

  it("releases the slot when the task rejects", async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);
    const run = singleFlight(task);
    await expect(run()).rejects.toThrow("boom");
    await expect(run()).resolves.toBeUndefined();
  });
});

describe("probeSession outcome", () => {
  it("reports ok after applying the user", async () => {
    expect(await probeSession(deps())).toBe("ok");
  });

  it("reports cleared on a definitive failure", async () => {
    expect(await probeSession(deps({ fetchMe: vi.fn().mockRejectedValue(http(401, "SESSION_REVOKED")) }))).toBe("cleared");
  });

  it("reports unavailable when /auth/me fails transiently", async () => {
    const d = deps({ fetchMe: vi.fn().mockRejectedValue(http(503)) });
    expect(await probeSession(d)).toBe("unavailable");
    expect(d.clear).not.toHaveBeenCalled();
  });

  it("reports unavailable when the refresh fails transiently", async () => {
    const d = deps({
      fetchMe: vi.fn().mockRejectedValue(http(401, "TOKEN_STALE")),
      refresh: vi.fn().mockRejectedValue(http(503)),
    });
    expect(await probeSession(d)).toBe("unavailable");
    expect(d.clear).not.toHaveBeenCalled();
  });
});
