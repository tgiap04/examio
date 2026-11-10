import { errorFailure, refreshFailureAction, sessionProbeAction } from "./api-error-policy";

export interface SessionProbeDeps<TMe> {
  /** `/auth/me` without the interceptor's own refresh; resolves null/undefined when there is no user. */
  fetchMe: () => Promise<TMe | null | undefined>;
  /** The shared single-flight session refresh. */
  refresh: () => Promise<unknown>;
  apply: (me: TMe) => void;
  clear: () => void;
}

/**
 * Resolves the current session once: `/auth/me`, then at most one refresh and one retry.
 * Only a definitive failure clears the session; transient errors leave it untouched and
 * report "unavailable" so callers can tell "signed out" from "could not find out".
 */
export type ProbeOutcome = "ok" | "cleared" | "unavailable";

export async function probeSession<TMe>({
  fetchMe,
  refresh,
  apply,
  clear,
}: SessionProbeDeps<TMe>): Promise<ProbeOutcome> {
  const load = async (): Promise<"done" | "refresh" | "clear" | "keep"> => {
    try {
      const me = await fetchMe();
      if (!me) return "clear";
      apply(me);
      return "done";
    } catch (error) {
      return sessionProbeAction(errorFailure(error));
    }
  };

  const first = await load();
  if (first === "done") return "ok";
  if (first === "clear") {
    clear();
    return "cleared";
  }
  if (first === "keep") return "unavailable";

  try {
    await refresh();
  } catch (error) {
    if (refreshFailureAction(errorFailure(error)) === "clear") {
      clear();
      return "cleared";
    }
    return "unavailable";
  }

  // A 401 right after a successful refresh will not heal on its own: end the session.
  const second = await load();
  if (second === "done") return "ok";
  if (second === "keep") return "unavailable";
  clear();
  return "cleared";
}

/** Concurrent callers share one in-flight run; the slot frees when it settles. */
export function singleFlight<T>(task: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (!inFlight) {
      inFlight = task().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}
