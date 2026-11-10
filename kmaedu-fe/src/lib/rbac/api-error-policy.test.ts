import { describe, expect, it } from "vitest";
import {
  apiErrorAction,
  errorFailure,
  refreshFailureAction,
  sessionProbeAction,
  socketErrorAction,
} from "./api-error-policy";

describe("apiErrorAction", () => {
  it("refreshes and retries a TOKEN_STALE that has not been retried", () => {
    expect(apiErrorAction({ status: 401, code: "TOKEN_STALE", retried: false })).toBe("refresh-retry");
  });

  it("refreshes and retries TOKEN_EXPIRED", () => {
    expect(apiErrorAction({ status: 401, code: "TOKEN_EXPIRED", retried: false })).toBe("refresh-retry");
  });

  it("logs out when the retried request is still 401 (no loop)", () => {
    expect(apiErrorAction({ status: 401, code: "TOKEN_STALE", retried: true })).toBe("logout");
  });

  it("logs out on SESSION_REVOKED without refreshing", () => {
    expect(apiErrorAction({ status: 401, code: "SESSION_REVOKED", retried: false })).toBe("logout");
  });

  it("toasts and refetches the user on PERMISSION_DENIED", () => {
    expect(apiErrorAction({ status: 403, code: "PERMISSION_DENIED", retried: false })).toBe("toast-refetch");
  });

  it("redirects to verify on EMAIL_NOT_VERIFIED", () => {
    expect(apiErrorAction({ status: 403, code: "EMAIL_NOT_VERIFIED", retried: false })).toBe("verify-redirect");
  });

  it("passes every other error through", () => {
    expect(apiErrorAction({ status: 500, code: "INTERNAL", retried: false })).toBe("pass-through");
    expect(apiErrorAction({ status: 403, code: "OTHER", retried: false })).toBe("pass-through");
    expect(apiErrorAction({ status: undefined, code: undefined, retried: false })).toBe("pass-through");
  });
});

describe("socketErrorAction", () => {
  it("refreshes and reconnects on auth:reauth / expired / stale tokens", () => {
    for (const code of ["REAUTH", "TOKEN_EXPIRED", "TOKEN_STALE"]) {
      expect(socketErrorAction(code, false)).toBe("refresh-reconnect");
    }
  });

  it("logs out when the token error repeats after the reconnect", () => {
    expect(socketErrorAction("TOKEN_EXPIRED", true)).toBe("logout");
    expect(socketErrorAction("REAUTH", true)).toBe("logout");
  });

  it("leaves the room on PERMISSION_DENIED", () => {
    expect(socketErrorAction("PERMISSION_DENIED", false)).toBe("leave-room");
  });

  it("asks for a client-side backoff retry on SERVICE_UNAVAILABLE (socket.io does not reconnect after a middleware error)", () => {
    expect(socketErrorAction("SERVICE_UNAVAILABLE", false)).toBe("backoff");
  });

  it("ignores unknown or missing codes", () => {
    expect(socketErrorAction(undefined, false)).toBe("ignore");
    expect(socketErrorAction("xhr poll error", false)).toBe("ignore");
  });
});

describe("sessionProbeAction", () => {
  it("refreshes on a 401 the refresh token may still fix", () => {
    expect(sessionProbeAction({ status: 401, code: "TOKEN_STALE" })).toBe("refresh");
    expect(sessionProbeAction({ status: 401, code: "TOKEN_EXPIRED" })).toBe("refresh");
    expect(sessionProbeAction({ status: 401, code: undefined })).toBe("refresh");
  });

  it("clears the session on SESSION_REVOKED without refreshing", () => {
    expect(sessionProbeAction({ status: 401, code: "SESSION_REVOKED" })).toBe("clear");
  });

  it("keeps the session on rate limiting, server errors and network failures", () => {
    expect(sessionProbeAction({ status: 429, code: undefined })).toBe("keep");
    expect(sessionProbeAction({ status: 503, code: "SERVICE_UNAVAILABLE" })).toBe("keep");
    expect(sessionProbeAction({ status: 500, code: undefined })).toBe("keep");
    expect(sessionProbeAction({ status: undefined, code: undefined })).toBe("keep");
  });
});

describe("refreshFailureAction", () => {
  it("clears the session when the refresh token is rejected", () => {
    expect(refreshFailureAction({ status: 401 })).toBe("clear");
    expect(refreshFailureAction({ status: 403 })).toBe("clear");
  });

  it("keeps the session on transient refresh failures", () => {
    expect(refreshFailureAction({ status: 429 })).toBe("keep");
    expect(refreshFailureAction({ status: 502 })).toBe("keep");
    expect(refreshFailureAction({ status: undefined })).toBe("keep");
  });
});

describe("errorFailure", () => {
  it("reads status and code from an ApiRequestError-like error", () => {
    expect(errorFailure(Object.assign(new Error("x"), { status: 401, code: "TOKEN_STALE" }))).toEqual({
      status: 401,
      code: "TOKEN_STALE",
    });
  });

  it("reads status and code from a raw axios-like error", () => {
    expect(errorFailure({ response: { status: 429, data: { code: "RATE_LIMITED" } } })).toEqual({
      status: 429,
      code: "RATE_LIMITED",
    });
  });

  it("returns an empty failure for network errors and non-objects", () => {
    expect(errorFailure(new Error("Network Error"))).toEqual({ status: undefined, code: undefined });
    expect(errorFailure(null)).toEqual({ status: undefined, code: undefined });
  });
});
