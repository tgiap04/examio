export const IDEMPOTENCY_HEADER = "Idempotency-Key";

/** One key per user action; reuse it for automatic retries of that same action only. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function idempotencyConfig(key: string): { headers: Record<string, string> } {
  if (!key) throw new Error("Idempotency key is required");
  return { headers: { [IDEMPOTENCY_HEADER]: key } };
}
