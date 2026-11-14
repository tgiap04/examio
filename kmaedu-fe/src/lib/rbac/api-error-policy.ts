/** Pure mapping from an API / socket error to the action the client takes. */

export type ApiErrorAction = "refresh-retry" | "logout" | "toast-refetch" | "verify-redirect" | "pass-through";

export interface ApiErrorInput {
  status: number | undefined;
  code: string | undefined;
  /** The request already went through one refresh-and-retry. */
  retried: boolean;
}

export function apiErrorAction({ status, code, retried }: ApiErrorInput): ApiErrorAction {
  if (status === 401) {
    if (code === "SESSION_REVOKED") return "logout";
    // TOKEN_EXPIRED / TOKEN_STALE (and any other 401): refresh once, then give up.
    return retried ? "logout" : "refresh-retry";
  }
  if (status === 403) {
    if (code === "PERMISSION_DENIED") return "toast-refetch";
    if (code === "EMAIL_NOT_VERIFIED") return "verify-redirect";
  }
  return "pass-through";
}

/** What a failed `/auth/me` or `/auth/refresh` looked like, whatever shape the error took. */
export interface ErrorFailure {
  status: number | undefined;
  code: string | undefined;
}

/** Reads status + gateway code from an `ApiRequestError` or a raw axios error; network errors give neither. */
export function errorFailure(error: unknown): ErrorFailure {
  if (typeof error !== "object" || error === null) return { status: undefined, code: undefined };
  const e = error as { status?: unknown; code?: unknown; response?: { status?: unknown; data?: { code?: unknown } } };
  const status = typeof e.status === "number" ? e.status : typeof e.response?.status === "number" ? e.response.status : undefined;
  const rawCode = typeof e.code === "string" ? e.code : e.response?.data?.code;
  return { status, code: typeof rawCode === "string" ? rawCode : undefined };
}

/**
 * Outcome of a failed session probe (`/auth/me`).
 * - `refresh`: a 401 the refresh token may still fix.
 * - `clear`: the session is definitively gone (revoked).
 * - `keep`: transient (429 / 5xx / network) — leave the current session state alone.
 */
export type SessionProbeAction = "refresh" | "clear" | "keep";

export function sessionProbeAction({ status, code }: ErrorFailure): SessionProbeAction {
  if (status !== 401) return "keep";
  return code === "SESSION_REVOKED" ? "clear" : "refresh";
}

/** Outcome of a failed `/auth/refresh`: only a rejected refresh token ends the session. */
export function refreshFailureAction({ status }: Pick<ErrorFailure, "status">): "clear" | "keep" {
  return status === 401 || status === 403 ? "clear" : "keep";
}

export type SocketErrorAction = "refresh-reconnect" | "logout" | "leave-room" | "backoff" | "ignore";

/** `REAUTH` is the code used for the server's `auth:reauth` event. */
export const SOCKET_REAUTH_CODE = "REAUTH";

export function socketErrorAction(code: string | undefined, retried: boolean): SocketErrorAction {
  switch (code) {
    case SOCKET_REAUTH_CODE:
    case "TOKEN_EXPIRED":
    case "TOKEN_STALE":
      return retried ? "logout" : "refresh-reconnect";
    case "PERMISSION_DENIED":
      return "leave-room";
    case "SERVICE_UNAVAILABLE":
      return "backoff";
    default:
      return "ignore";
  }
}
