import type { Socket } from "socket.io-client";
import { handleAuthFailure, refreshAccessToken } from "@/apis/api";
import { toast } from "@/components/antd/toast";
import i18n from "@/lib/i18n";
import {
  SOCKET_REAUTH_CODE,
  errorFailure,
  refreshFailureAction,
  socketErrorAction,
} from "@/lib/rbac/api-error-policy";
import {
  MAX_BACKOFF_ATTEMPTS,
  backoffDelayMs,
  createGiveUp,
  createReauthCycle,
  reauthDeferMs,
} from "@/lib/rbac/socket-reconnect";

// Server event asking the client to refresh its token and reconnect (token
// reached `exp`, or the user's roles changed).
const AUTH_REAUTH_EVENT = "auth:reauth";
// socket.io-client's connect_error message when the WebSocket upgrade fails.
const TRANSPORT_UPGRADE_ERROR = "websocket error";

interface RecoveryOptions {
  onKicked?: () => void;
  onGiveUp: () => void;
}

/**
 * Reconnect handling for one study-room socket: token re-auth (one refresh +
 * one reconnect per cycle) and capped backoff when the gateway is unavailable.
 * socket.io does not reconnect after a server-side disconnect or a middleware
 * `connect_error`, so both are handled here. Returns a disposer that clears
 * every pending timer.
 */
export function attachSocketRecovery(socket: Socket, opts: RecoveryOptions): () => void {
  const cycle = createReauthCycle();
  let reauthTried = false;
  let refreshing = false;
  let lastConnectAt: number | null = null;
  let backoffAttempt = 0;
  let backoffTimer: ReturnType<typeof setTimeout> | null = null;
  let deferTimer: ReturnType<typeof setTimeout> | null = null;

  const giveUp = createGiveUp(() => {
    opts.onGiveUp();
    toast.error(i18n.t("rbac.studyRoomUnavailable", { ns: "common" }));
  });

  // Set by the disposer: a refresh still in flight must not reconnect (and
  // re-JOIN) a socket the hook has already torn down.
  let disposed = false;
  // A reauth refresh failed transiently and must be retried by the backoff.
  let refreshPending = false;

  const connect = () => {
    if (!disposed && !socket.connected) socket.connect();
  };

  const scheduleBackoff = () => {
    if (backoffTimer || giveUp.isGivenUp()) return;
    if (backoffAttempt >= MAX_BACKOFF_ATTEMPTS) {
      giveUp.trigger();
      return;
    }
    backoffTimer = setTimeout(() => {
      backoffTimer = null;
      // After a failed refresh the socket still holds a stale token, which the
      // gateway rejects at upgrade ("websocket error", no namespace code), so
      // retry the refresh first; it reconnects on success.
      if (refreshPending) void runRefresh();
      else connect();
    }, backoffDelayMs(backoffAttempt++));
  };

  async function runRefresh() {
    refreshing = true;
    reauthTried = true;
    try {
      await refreshAccessToken();
      if (disposed) return;
      if (refreshPending) {
        // Retry of a failed refresh: the server already dropped the socket.
        refreshPending = false;
        cycle.reset();
        connect();
      } else if (cycle.onRefreshDone()) {
        connect();
      }
    } catch (err) {
      if (disposed) return;
      if (refreshFailureAction(errorFailure(err)) === "clear") {
        handleAuthFailure();
        return;
      }
      // Transient (429 / 5xx / network): keep the session, retry with backoff.
      reauthTried = false;
      refreshPending = true;
      scheduleBackoff();
    } finally {
      refreshing = false;
    }
  }

  const onSocketError = (code: string | undefined) => {
    const action = socketErrorAction(code, reauthTried);
    if (action === "leave-room") {
      toast.error(i18n.t("rbac.studyRoomDenied", { ns: "common" }));
      opts.onKicked?.();
    } else if (action === "logout") {
      handleAuthFailure();
    } else if (action === "backoff") {
      scheduleBackoff();
    } else if (action === "refresh-reconnect" && !refreshing && !refreshPending && !deferTimer) {
      // Hold a reauth that follows a reconnect too closely (misbehaving server).
      const defer = reauthDeferMs(Date.now(), lastConnectAt);
      if (defer <= 0) {
        void runRefresh();
        return;
      }
      deferTimer = setTimeout(() => {
        deferTimer = null;
        void runRefresh();
      }, defer);
    }
  };

  socket.on(AUTH_REAUTH_EVENT, () => onSocketError(SOCKET_REAUTH_CODE));
  socket.on("connect_error", (err: Error) => {
    // A middleware rejection leaves the socket dead with no server disconnect to wait for.
    if (socketErrorAction(err.message, reauthTried) === "refresh-reconnect") cycle.onServerDisconnect();
    // The gateway rejects an upgrade carrying an expired/stale token with a
    // plain HTTP 401, which socket.io reports only as "websocket error". Try
    // one refresh per disconnect cycle so a token that aged while offline
    // recovers; a genuine network fault just falls through to the give-up.
    // refreshPending: a refresh retry is already owned by the backoff timer.
    if (err.message === TRANSPORT_UPGRADE_ERROR) {
      if (reauthTried || refreshing || refreshPending) return;
      refreshPending = true;
      void runRefresh();
      return;
    }
    onSocketError(err.message);
  });
  // socket.io's own reconnection (transport errors, e.g. gateway ECONNREFUSED) ran out.
  const onTransportGiveUp = () => {
    if (backoffTimer) clearTimeout(backoffTimer);
    backoffTimer = null;
    giveUp.trigger();
  };
  socket.io.on("reconnect_failed", onTransportGiveUp);
  socket.on("connect", () => {
    reauthTried = false;
    refreshPending = false;
    backoffAttempt = 0;
    giveUp.reset();
    lastConnectAt = Date.now();
    cycle.reset();
  });
  socket.on("disconnect", (reason) => {
    // Server-initiated drop: reconnect now if the refresh already finished.
    if (reason === "io server disconnect" && cycle.onServerDisconnect()) connect();
  });

  return () => {
    disposed = true;
    socket.io.off("reconnect_failed", onTransportGiveUp);
    if (backoffTimer) clearTimeout(backoffTimer);
    if (deferTimer) clearTimeout(deferTimer);
    backoffTimer = null;
    deferTimer = null;
  };
}
