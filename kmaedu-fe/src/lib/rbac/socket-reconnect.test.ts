import { describe, expect, it, vi } from "vitest";
import {
  MAX_BACKOFF_ATTEMPTS,
  REAUTH_MIN_INTERVAL_MS,
  backoffDelayMs,
  TRANSPORT_RECONNECT_OPTIONS,
  createGiveUp,
  createReauthCycle,
  reauthDeferMs,
} from "./socket-reconnect";

describe("backoffDelayMs", () => {
  it("doubles per attempt (about 1s, 2s, 4s, 8s)", () => {
    expect(backoffDelayMs(0, () => 0.5)).toBe(1000);
    expect(backoffDelayMs(1, () => 0.5)).toBe(2000);
    expect(backoffDelayMs(2, () => 0.5)).toBe(4000);
    expect(backoffDelayMs(3, () => 0.5)).toBe(8000);
  });

  it("jitters within +-20% of the base", () => {
    expect(backoffDelayMs(2, () => 0)).toBe(3200);
    expect(backoffDelayMs(2, () => 1)).toBe(4800);
  });

  it("never exceeds 30s", () => {
    expect(backoffDelayMs(10, () => 1)).toBe(30_000);
    expect(backoffDelayMs(50, () => 1)).toBe(30_000);
  });

  it("caps attempts at 5", () => {
    expect(MAX_BACKOFF_ATTEMPTS).toBe(5);
  });
});

describe("createReauthCycle", () => {
  it("connects when the refresh finishes after the server disconnect", () => {
    const c = createReauthCycle();
    expect(c.onServerDisconnect()).toBe(false);
    expect(c.onRefreshDone()).toBe(true);
  });

  it("connects when the server disconnect arrives after the refresh finished", () => {
    const c = createReauthCycle();
    expect(c.onRefreshDone()).toBe(false);
    expect(c.onServerDisconnect()).toBe(true);
  });

  it("connects exactly once per cycle", () => {
    const c = createReauthCycle();
    expect(c.onRefreshDone()).toBe(false);
    expect(c.onServerDisconnect()).toBe(true);
    expect(c.onRefreshDone()).toBe(false);
  });

  it("starts a fresh cycle after reset", () => {
    const c = createReauthCycle();
    c.onRefreshDone();
    c.reset();
    expect(c.onServerDisconnect()).toBe(false);
    expect(c.onRefreshDone()).toBe(true);
  });
});

describe("reauthDeferMs", () => {
  it("does not defer when there was no earlier reconnect", () => {
    expect(reauthDeferMs(10_000, null)).toBe(0);
  });

  it("defers a reauth that follows a reconnect too closely", () => {
    expect(reauthDeferMs(11_000, 10_000)).toBe(REAUTH_MIN_INTERVAL_MS - 1000);
  });

  it("does not defer once the interval has elapsed", () => {
    expect(reauthDeferMs(10_000 + REAUTH_MIN_INTERVAL_MS, 10_000)).toBe(0);
  });
});

describe("createGiveUp", () => {
  it("fires the action once across both retry mechanisms", () => {
    const action = vi.fn();
    const giveUp = createGiveUp(action);
    expect(giveUp.isGivenUp()).toBe(false);
    giveUp.trigger();
    giveUp.trigger();
    expect(action).toHaveBeenCalledTimes(1);
    expect(giveUp.isGivenUp()).toBe(true);
    giveUp.reset();
    giveUp.trigger();
    expect(action).toHaveBeenCalledTimes(2);
  });
});

describe("transport reconnect options", () => {
  it("caps transport retries", () => {
    expect(TRANSPORT_RECONNECT_OPTIONS.reconnectionAttempts).toBe(5);
    expect(TRANSPORT_RECONNECT_OPTIONS.reconnectionDelayMax).toBe(30_000);
  });
});
