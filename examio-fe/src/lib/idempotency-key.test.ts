import { describe, expect, it } from "vitest";
import { IDEMPOTENCY_HEADER, idempotencyConfig, newIdempotencyKey } from "./idempotency-key";

describe("idempotency key", () => {
  it("generates a fresh uuid per call", () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });

  it("puts the key in the Idempotency-Key header", () => {
    expect(IDEMPOTENCY_HEADER).toBe("Idempotency-Key");
    expect(idempotencyConfig("k1")).toEqual({ headers: { "Idempotency-Key": "k1" } });
  });

  it("rejects an empty key so a call can never go out unkeyed", () => {
    expect(() => idempotencyConfig("")).toThrow();
  });
});
