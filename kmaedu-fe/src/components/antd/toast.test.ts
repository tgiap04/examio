import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "./toast";

const message = vi.hoisted(() => ({
  error: vi.fn(() => "handle"),
  success: vi.fn(() => "handle"),
  info: vi.fn(() => "handle"),
  warning: vi.fn(() => "handle"),
}));
vi.mock("antd", () => ({ message }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  Object.values(message).forEach((fn) => fn.mockClear());
});

describe("toast (D9: one denied action shows one toast)", () => {
  it("the interceptor toast and the caller's catch-block toast for the same denial show once", () => {
    const denied = "Bạn không có quyền thực hiện thao tác này";
    toast.error(denied); // api.ts interceptor (action toast-refetch)
    toast.error(denied); // the store/page catch block re-showing error.message
    expect(message.error).toHaveBeenCalledTimes(1);
  });

  it("a repeat after the first toast has gone shows again", () => {
    toast.error("denied");
    vi.advanceTimersByTime(3500);
    toast.error("denied");
    expect(message.error).toHaveBeenCalledTimes(2);
  });

  it("different messages and different variants are never merged", () => {
    toast.error("a");
    toast.error("b");
    toast.success("a");
    expect(message.error).toHaveBeenCalledTimes(2);
    expect(message.success).toHaveBeenCalledTimes(1);
  });
});
