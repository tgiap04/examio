import { create } from "zustand";
import { getWalletInfoApi } from "@/apis/walletApi";
import { nextWalletRefresh, walletFetchDecision } from "@/lib/wallet/wallet-fetch-policy";
import { useAuthStore } from "@/stores/useAuthStore";

interface WalletState {
  /** null until loaded this session (and always null without `wallet:use`). */
  balance: number | null;
  loading: boolean;
  error: string | null;
  /** Loads the balance once per session; `force` refreshes after a payment / debit. */
  loadBalance: (options?: { force?: boolean }) => Promise<void>;
  /** Applies a balance a debit response already carries (no request). */
  setBalance: (balance: number) => void;
}

/** A forced refresh requested while a load was in flight; replayed once it settles. */
let followUpQueued = false;
/** Bumped on every store reset (role change / logout); responses of an older generation are dropped. */
let generation = 0;

export const useWalletStore = create<WalletState>((set, get) => ({
  balance: null,
  loading: false,
  error: null,

  loadBalance: async ({ force = false } = {}) => {
    const { balance, loading } = get();
    const canUse = useAuthStore.getState().permissions.includes("wallet:use");
    const guard = nextWalletRefresh({ loading, force, queued: followUpQueued });
    if (guard.action === "queue") {
      followUpQueued = true;
      return;
    }
    if (guard.action === "ignore") return;
    if (walletFetchDecision({ canUse, balance, loading, force }) !== "fetch") return;

    const startedIn = generation;
    set({ loading: true, error: null });
    try {
      const info = await getWalletInfoApi();
      if (startedIn !== generation) return;
      set({ balance: info.balance, loading: false });
    } catch (error) {
      if (startedIn !== generation) return;
      set({ loading: false, error: error instanceof Error ? error.message : "Không tải được số dư ví" });
    }
    if (followUpQueued) {
      followUpQueued = false;
      await get().loadBalance({ force: true });
    }
  },

  setBalance: (balance) => set({ balance }),
}));

// resetRoleScopedState() replaces the state with the initial object; treat that as a session boundary.
useWalletStore.subscribe((next) => {
  if (next === useWalletStore.getInitialState()) {
    generation += 1;
    followUpQueued = false;
  }
});
