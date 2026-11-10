export type WalletFetchDecision = "fetch" | "skip-forbidden" | "skip-cached" | "skip-inflight";

export interface WalletFetchInput {
  /** The session holds `wallet:use` (no wallet for anyone else, so no request). */
  canUse: boolean;
  /** Last loaded balance; null until the first load this session. */
  balance: number | null;
  loading: boolean;
  /** After a payment or a debit: bypass the session cache. */
  force: boolean;
}

/** Pure gate in front of `GET /wallet/info`. */
export function walletFetchDecision({ canUse, balance, loading, force }: WalletFetchInput): WalletFetchDecision {
  if (!canUse) return "skip-forbidden";
  if (loading) return "skip-inflight";
  if (balance !== null && !force) return "skip-cached";
  return "fetch";
}

export type WalletRefreshAction = "proceed" | "queue" | "ignore";

/**
 * Guards a `loadBalance` call against an in-flight load: a forced refresh that
 * arrives mid-load is queued once (the in-flight response may predate the payment).
 */
export function nextWalletRefresh({ loading, force, queued }: { loading: boolean; force: boolean; queued: boolean }): {
  action: WalletRefreshAction;
} {
  if (!loading) return { action: "proceed" };
  return { action: force && !queued ? "queue" : "ignore" };
}
