import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWalletStore } from "./useWalletStore";

const state = vi.hoisted(() => ({ permissions: [] as string[] }));
const getWalletInfoApi = vi.hoisted(() => vi.fn());
vi.mock("@/stores/useAuthStore", () => ({
  useAuthStore: { getState: () => ({ permissions: state.permissions }) },
}));
vi.mock("@/apis/walletApi", () => ({ getWalletInfoApi }));

beforeEach(() => {
  state.permissions = [];
  getWalletInfoApi.mockReset().mockResolvedValue({ balance: 20 });
  useWalletStore.setState(useWalletStore.getInitialState(), true);
});

describe("useWalletStore", () => {
  it("does not call GET /wallet/info without wallet:use", async () => {
    await useWalletStore.getState().loadBalance();
    expect(getWalletInfoApi).not.toHaveBeenCalled();
    expect(useWalletStore.getState().balance).toBeNull();
  });

  it("loads once with wallet:use and caches for the session", async () => {
    state.permissions = ["wallet:use"];
    await useWalletStore.getState().loadBalance();
    await useWalletStore.getState().loadBalance();
    expect(getWalletInfoApi).toHaveBeenCalledTimes(1);
    expect(useWalletStore.getState().balance).toBe(20);
  });

  it("collapses concurrent loads into one request", async () => {
    state.permissions = ["wallet:use"];
    await Promise.all([useWalletStore.getState().loadBalance(), useWalletStore.getState().loadBalance()]);
    expect(getWalletInfoApi).toHaveBeenCalledTimes(1);
  });

  it("force refreshes after a payment or debit", async () => {
    state.permissions = ["wallet:use"];
    await useWalletStore.getState().loadBalance();
    getWalletInfoApi.mockResolvedValue({ balance: 5 });
    await useWalletStore.getState().loadBalance({ force: true });
    expect(useWalletStore.getState().balance).toBe(5);
  });

  it("keeps the last known balance and reports the failure when a refresh fails", async () => {
    state.permissions = ["wallet:use"];
    await useWalletStore.getState().loadBalance();
    getWalletInfoApi.mockRejectedValue(new Error("boom"));
    await useWalletStore.getState().loadBalance({ force: true });
    expect(useWalletStore.getState().balance).toBe(20);
    expect(useWalletStore.getState().error).toBe("boom");
  });

  it("setBalance applies a debit result without a request", () => {
    useWalletStore.getState().setBalance(7);
    expect(useWalletStore.getState().balance).toBe(7);
    expect(getWalletInfoApi).not.toHaveBeenCalled();
  });

  it("drops a response that arrives after the session was reset", async () => {
    state.permissions = ["wallet:use"];
    let resolve!: (v: { balance: number }) => void;
    getWalletInfoApi.mockReturnValue(new Promise((r) => (resolve = r)));
    const pending = useWalletStore.getState().loadBalance();
    // role change / logout: same reset the app performs
    useWalletStore.setState(useWalletStore.getInitialState(), true);
    resolve({ balance: 999 });
    await pending;
    expect(useWalletStore.getState().balance).toBeNull();
    expect(useWalletStore.getState().loading).toBe(false);
  });

  it("clears a queued follow-up on reset so the next session starts clean", async () => {
    state.permissions = ["wallet:use"];
    let resolve!: (v: { balance: number }) => void;
    getWalletInfoApi.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const pending = useWalletStore.getState().loadBalance();
    await useWalletStore.getState().loadBalance({ force: true }); // queued
    useWalletStore.setState(useWalletStore.getInitialState(), true);
    resolve({ balance: 1 });
    await pending;
    expect(getWalletInfoApi).toHaveBeenCalledTimes(1); // no replay for the old session
    getWalletInfoApi.mockResolvedValue({ balance: 20 });
    await useWalletStore.getState().loadBalance();
    expect(useWalletStore.getState().balance).toBe(20);
  });
});
