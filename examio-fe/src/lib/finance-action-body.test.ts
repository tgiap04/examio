import { describe, expect, it } from "vitest";
import {
  buildCreditBody,
  buildRefundBody,
  buildSetTierBody,
  isReasonLongEnough,
} from "./finance-action-body";

describe("finance action bodies match the admin-service DTOs", () => {
  it("credit: string userId (trimmed), positive amount, explicit direction", () => {
    expect(
      buildCreditBody(
        { userId: "  u_123 ", amount: 5, reason: " reason text here " },
        "ADD",
      ),
    ).toEqual({
      userId: "u_123",
      amount: 5,
      direction: "ADD",
      reason: "reason text here",
    });
  });

  it("credit: SUBTRACT keeps the amount positive and sets the direction", () => {
    const body = buildCreditBody(
      { userId: "u_1", amount: -7, reason: "long enough reason" },
      "SUBTRACT",
    );
    expect(body.amount).toBe(7);
    expect(body.direction).toBe("SUBTRACT");
  });

  it("refund: trims ids and reason", () => {
    expect(
      buildRefundBody({ paymentId: " pay_1 ", reason: " long enough reason " }),
    ).toEqual({ paymentId: "pay_1", reason: "long enough reason" });
  });

  it("set-tier: string userId, integer tier, billing cycle", () => {
    expect(
      buildSetTierBody({
        userId: " u_9 ",
        tier: 2,
        billingCycle: "yearly",
        reason: "long enough reason",
      }),
    ).toEqual({
      userId: "u_9",
      tier: 2,
      billingCycle: "yearly",
      reason: "long enough reason",
    });
  });
});

describe("isReasonLongEnough", () => {
  it("counts the trimmed length, not the raw one", () => {
    expect(isReasonLongEnough("   short   ")).toBe(false);
    expect(isReasonLongEnough("          ")).toBe(false);
    expect(isReasonLongEnough("  ten chars!  ")).toBe(true);
    expect(isReasonLongEnough(undefined)).toBe(false);
  });
});
