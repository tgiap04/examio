import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePageConfigStore } from "./usePageConfigStore";

const fetchPages = vi.hoisted(() => vi.fn());
vi.mock("@/apis/configApi", () => ({ fetchPages }));

beforeEach(() => {
  fetchPages.mockReset();
  usePageConfigStore.setState(usePageConfigStore.getInitialState(), true);
});

describe("usePageConfigStore (no flags yet = every page enabled)", () => {
  it("an empty map from the gateway enables every page", async () => {
    fetchPages.mockResolvedValue({});
    await usePageConfigStore.getState().loadPages();
    const { isEnabled, loaded } = usePageConfigStore.getState();
    expect(loaded).toBe(true);
    expect(isEnabled("anything")).toBe(true);
  });

  it("an unreachable config endpoint fails open", async () => {
    fetchPages.mockRejectedValue(new Error("network"));
    await usePageConfigStore.getState().loadPages();
    expect(usePageConfigStore.getState().isEnabled("anything")).toBe(true);
  });

  it("only an explicit false disables a page", () => {
    usePageConfigStore.getState().setPages({ a: false, b: true });
    const { isEnabled } = usePageConfigStore.getState();
    expect([isEnabled("a"), isEnabled("b"), isEnabled("c")]).toEqual([false, true, true]);
  });
});
