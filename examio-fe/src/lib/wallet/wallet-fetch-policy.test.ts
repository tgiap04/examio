import { describe, expect, it } from "vitest";
import { walletFetchDecision } from "./wallet-fetch-policy";

describe("walletFetchDecision", () => {
  it("never fetches without wallet:use (a TEACHER-less STUDENT has no wallet)", () => {
    expect(walletFetchDecision({ canUse: false, balance: null, loading: false, force: true })).toBe("skip-forbidden");
  });

  it("fetches the first time", () => {
    expect(walletFetchDecision({ canUse: true, balance: null, loading: false, force: false })).toBe("fetch");
  });

  it("serves the cached balance for the rest of the session", () => {
    expect(walletFetchDecision({ canUse: true, balance: 20, loading: false, force: false })).toBe("skip-cached");
  });

  it("force refetches after a payment or a debit", () => {
    expect(walletFetchDecision({ canUse: true, balance: 20, loading: false, force: true })).toBe("fetch");
  });

  it("never starts a second request while one is in flight", () => {
    expect(walletFetchDecision({ canUse: true, balance: null, loading: true, force: true })).toBe("skip-inflight");
  });
});
