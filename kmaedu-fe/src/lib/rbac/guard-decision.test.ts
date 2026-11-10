import { describe, expect, it } from "vitest";
import { guardDecision } from "./guard-decision";

const base = { initializing: false, isAuthenticated: true, sessionUnavailable: false, allowed: true };

describe("guardDecision", () => {
  it("waits while initializing", () => {
    expect(guardDecision({ ...base, initializing: true })).toBe("loading");
  });
  it("renders when authenticated and allowed", () => {
    expect(guardDecision(base)).toBe("render");
  });
  it("forbids an authenticated user without permission", () => {
    expect(guardDecision({ ...base, allowed: false })).toBe("forbidden");
  });
  it("redirects an anonymous user to login", () => {
    expect(guardDecision({ ...base, isAuthenticated: false })).toBe("login");
  });
  it("shows the unavailable screen instead of login when the session is unknown", () => {
    expect(guardDecision({ ...base, isAuthenticated: false, sessionUnavailable: true })).toBe("unavailable");
  });
  it("keeps rendering an in-memory session even if a later probe failed", () => {
    expect(guardDecision({ ...base, sessionUnavailable: true })).toBe("render");
  });
});
