import type { CreditBody, RefundBody, SetTierBody } from "@/apis/adminApi";

/**
 * Pure builders for the admin finance request bodies. They mirror the
 * admin-service DTOs (credit.body.ts / refund.body.ts / set-tier.body.ts):
 * string ids, a positive credit amount and an explicit direction.
 */

/** Minimum reason length the backend enforces, measured after trimming. */
export const MIN_REASON_LENGTH = 10;

export function isReasonLongEnough(reason: string | undefined): boolean {
  return (reason ?? "").trim().length >= MIN_REASON_LENGTH;
}

export function buildRefundBody(values: {
  paymentId: string;
  reason: string;
}): RefundBody {
  return {
    paymentId: values.paymentId.trim(),
    reason: values.reason.trim(),
  };
}

export function buildCreditBody(
  values: { userId: string; amount: number; reason: string },
  direction: CreditBody["direction"],
): CreditBody {
  return {
    userId: values.userId.trim(),
    amount: Math.abs(values.amount),
    direction,
    reason: values.reason.trim(),
  };
}

export function buildSetTierBody(values: {
  userId: string;
  tier: number;
  billingCycle?: SetTierBody["billingCycle"];
  reason: string;
}): SetTierBody {
  return {
    userId: values.userId.trim(),
    tier: values.tier,
    ...(values.billingCycle ? { billingCycle: values.billingCycle } : {}),
    reason: values.reason.trim(),
  };
}
