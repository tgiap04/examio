# Edge Cases — F005_Finance

| Scenario | What Happens | User-Facing Message |
|----------|-------------|---------------------|
| Payment amount does not match the plan price | Payment is received but credited as a generic deposit; subscription not activated | "Payment received but could not be matched to a plan. Please contact support." |
| Duplicate webhook received for the same transfer | Payment record uses unique constraint on orderId; duplicate is ignored | None — silent deduplication |
| Virtual account expires before payment | Payment window expires (10 minutes); user must initiate a new payment | "Payment window expired. Please start a new purchase." |
| Webhook signature invalid | Signature verification fails; webhook is rejected and not processed | None — silent reject |
| User closes QR dialog before payment | Payment intent remains in unpaid state; user can return and pay again | None |
| Subscription already active when second payment arrives | Wallet is topped up or subscription renewal is queued; no duplicate activation | "Your subscription is already active. The payment has been added to your wallet." |
| Wallet balance is zero and user tries to use AI generation | Credit check fails; error shown with link to subscription page | "You don't have enough credits. Please purchase a plan to continue." |
| Webhook arrives for a cancelled payment | Payment status check fails; no wallet update | None — silent ignore |
