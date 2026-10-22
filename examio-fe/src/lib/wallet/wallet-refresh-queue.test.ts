import { describe, expect, it } from "vitest";
import { nextWalletRefresh } from "./wallet-fetch-policy";

describe("nextWalletRefresh", () => {
  it("queues one follow-up when a forced refresh arrives during a load", () => {
    expect(nextWalletRefresh({ loading: true, force: true, queued: false })).toEqual({ action: "queue" });
  });

  it("does not queue for a non-forced request during a load", () => {
    expect(nextWalletRefresh({ loading: true, force: false, queued: false })).toEqual({ action: "ignore" });
  });

  it("coalesces repeated forced requests into one follow-up", () => {
    expect(nextWalletRefresh({ loading: true, force: true, queued: true })).toEqual({ action: "ignore" });
  });

  it("proceeds to the normal decision when idle", () => {
    expect(nextWalletRefresh({ loading: false, force: true, queued: false })).toEqual({ action: "proceed" });
  });
});
