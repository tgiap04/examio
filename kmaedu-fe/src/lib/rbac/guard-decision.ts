export type GuardDecision = "loading" | "unavailable" | "login" | "forbidden" | "render";

export interface GuardInput {
  initializing: boolean;
  isAuthenticated: boolean;
  /** The session probe could not reach the server and no session is in memory. */
  sessionUnavailable: boolean;
  allowed: boolean;
}

/** What a protected route should do. Pure so the redirect-vs-retry rule is testable. */
export function guardDecision({ initializing, isAuthenticated, sessionUnavailable, allowed }: GuardInput): GuardDecision {
  if (initializing) return "loading";
  if (!isAuthenticated) return sessionUnavailable ? "unavailable" : "login";
  return allowed ? "render" : "forbidden";
}
