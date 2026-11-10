/** Pure scheduling helpers for the study-room socket's manual reconnects. */

export const MAX_BACKOFF_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
const JITTER = 0.2;

/** Delay before retry `attempt` (0-based): 1s, 2s, 4s, ... +-20% jitter, capped at 30s. */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  const factor = 1 - JITTER + random() * 2 * JITTER;
  return Math.min(BACKOFF_MAX_MS, Math.round(base * factor));
}

/** Minimum gap between a successful reconnect and the next reauth cycle. */
export const REAUTH_MIN_INTERVAL_MS = 5000;

/** How long to hold back a reauth so a misbehaving server cannot cause a tight loop. */
export function reauthDeferMs(now: number, lastConnectAt: number | null): number {
  if (lastConnectAt === null) return 0;
  return Math.max(0, REAUTH_MIN_INTERVAL_MS - (now - lastConnectAt));
}

/**
 * One reauth cycle needs two things before reconnecting: the token refresh
 * finished and the server dropped the socket. They can arrive in either order;
 * whichever completes the pair is told to connect, exactly once.
 */
export function createReauthCycle() {
  let refreshDone = false;
  let serverDisconnected = false;
  const settle = () => {
    if (!refreshDone || !serverDisconnected) return false;
    refreshDone = false;
    serverDisconnected = false;
    return true;
  };
  return {
    onRefreshDone(): boolean {
      refreshDone = true;
      return settle();
    },
    onServerDisconnect(): boolean {
      serverDisconnected = true;
      return settle();
    },
    reset(): void {
      refreshDone = false;
      serverDisconnected = false;
    },
  };
}

/**
 * socket.io's own (transport-level) reconnection, used when the server is
 * unreachable. Bounded so an unreachable exam-service ends in the give-up toast
 * instead of retrying forever; `randomizationFactor` keeps socket.io's default
 * jitter so clients do not retry in lockstep.
 */
export const TRANSPORT_RECONNECT_OPTIONS = {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelayMax: 30_000,
  randomizationFactor: 0.5,
} as const;

/**
 * Wraps the give-up action so the two retry mechanisms (SERVICE_UNAVAILABLE
 * backoff and the transport reconnect) cannot both fire it. `isGivenUp()` lets
 * callers stop scheduling new retries once it fired.
 */
export function createGiveUp(action: () => void) {
  let done = false;
  return {
    trigger() {
      if (done) return;
      done = true;
      action();
    },
    isGivenUp: () => done,
    /** A successful connect re-arms the give-up for the next outage. */
    reset() {
      done = false;
    },
  };
}
