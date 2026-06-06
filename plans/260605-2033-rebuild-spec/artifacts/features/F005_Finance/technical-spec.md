# F005_Finance

**Priority**: P1
**Type**: ui
**Generated**: 2026-06-05

## Overview

Finance feature covering wallet balance display, transaction history, subscription purchase, and credit management. Users purchase subscription plans via SePay virtual accounts. The platform presents a QR code and VA number; the user transfers money via their banking app. SePay sends a webhook confirmation when the transfer clears, which activates the subscription and/or credits the wallet. Subscription tier gates access to AI generation features.

## Polymorphic Behavior

### DISC-003 — Payment.status

| Value | Render | Validation | Persistence |
|-------|--------|------------|-------------|
| 0 (unpaid) | QR code displayed; payment dialog open | Payment window active; VA number shown | Payment record created with status = unpaid |
| 1 (paid) | Payment confirmation shown; subscription activated | webhook signature verified; amount matched | Payment status updated to paid; wallet credited or subscription activated |
| 2 (overdue) | Warning shown on subscription page | VA expiry time reached before payment | Payment status updated to overdue |
| 3 (cancelled) | Payment dialog closed; new payment required | User cancels or duplicate webhook | Payment status updated to cancelled |

**Source:** `examio-be/apps/finance-service/src/webhook.controller.ts`

### DISC-005 / DISC-004 — UserSubscription.tier

| Value | Render | Validation | Persistence |
|-------|--------|------------|-------------|
| 0 (none) | SubscriptionPage shows all plans; AI tools show upgrade prompt | Standard access; AI gated | No UserSubscription record or tier = 0 |
| 1 (basic) | Basic features enabled | Upload and generation limits apply | UserSubscription record with tier = 1 |
| 2 (advanced) | Advanced features enabled | Higher limits than basic | UserSubscription record with tier = 2 |
| 3 (vip) | All features enabled | Highest limits | UserSubscription record with tier = 3 |

**Source:** `examio-be/apps/finance-service/src/wallet.service.ts`

---

## Cross-Cutting Logic

### Requirements

| Code | Description | Endpoint/Handler | Verifiable |
|------|-------------|-----------------|------------|
| FR-001 | View wallet balance and transactions | GET /api/v1/wallet/details | yes |
| FR-002 | View subscription plan | GET /api/v1/payment/subscription | yes |
| FR-003 | Initiate subscription purchase | POST /api/v1/payment/subscription | yes |
| FR-004 | Receive SePay webhook on transfer | webhook:SePay | yes |

### Business Rules


None.
### BR-001_SePayWebhookSignature
**Linked FR:** FR-004
**Source:** `examio-be/apps/finance-service/src/webhook.controller.ts`
**Applies to:** SePay webhook endpoint
**Rule:** Every incoming webhook must have a valid signature (API key). Invalid signatures are rejected and not processed.

**Pseudocode:**
```text
if webhook signature invalid → return 200 (do not retry)
if signature valid → process payment update
```

### BR-002_PaymentAmountMatch
**Linked FR:** FR-004
**Source:** `examio-be/apps/finance-service/src/payment.service.ts`
**Applies to:** SePay webhook handler
**Rule:** The transfer amount must match the expected amount for the created Payment record. Mismatched amounts are logged and credited as a generic deposit.

### BR-003_WalletCreditOnPayment
**Linked FR:** FR-004
**Source:** `examio-be/apps/finance-service/src/wallet.service.ts`
**Applies to:** Payment marked as paid
**Rule:** When a payment with `paymentType = credits` is confirmed, the corresponding amount is added to the user's wallet balance via a WalletTransaction with `direction = ADD`. Subscription payments activate or extend the UserSubscription.

### BR-004_SubscriptionTierGating
**Linked FR:** FR-002
**Source:** `examio-be/apps/exam-service/src/modules/finance-client/finance-client.service.ts`
**Applies to:** AI generation endpoints
**Rule:** AI generation requires sufficient wallet credits or an active subscription tier (PERM036). However, FREE_MODE = true bypasses this check in production.

### Decision Logic


None.
### State Machines


None.
### Algorithms


None.
### External Integrations


None.
### INT-001_SePayWebhook
**Linked FR:** FR-004
**Source:** `examio-be/apps/finance-service/src/webhook.controller.ts`
**Type:** webhook-emit
**Target:** Finance service webhook endpoint
**Trigger:** Bank transfer to the SePay virtual account
**Payload:** VA number, transfer amount, transfer content, order ID, timestamp
**Failure handling:** Invalid signature → 200 (no retry); amount mismatch → credited as generic deposit

### Verification

- **SC-001** — Subscription purchase creates a Payment record with status = unpaid and displays a QR code (covers FR-003)
- **SC-002** — SePay webhook with valid signature marks Payment status to paid and credits wallet (covers FR-004, BR-001, BR-002, BR-003)
- **SC-003** — Invalid webhook signature is rejected and not processed (covers BR-001)
- **SC-004** — Wallet balance reflects credit after successful payment (covers FR-001)

---

**Client behavior:** see
[`behavior-logic.md`](../../docs/system/behavior-logic.md) (client-side patterns — debounce, optimistic UI, polling, upload, realtime),
[`permissions.md`](../../docs/system/permissions.md) (feature flags / experiments / env / locale gates),
[`architecture.md`](../../docs/system/architecture.md) (guards / deep-link state restoration / unsaved-changes protection).

## User Stories

### US012 — Purchase Subscription (Priority: high)

**What happens:** A student selects a subscription plan on the SubscriptionPage, the platform creates a Payment record with status = unpaid and a SePay virtual account, and displays a QR code. The student transfers money via their banking app. SePay sends a webhook to the platform confirming the transfer. The payment is marked paid, credits are added to the wallet (or subscription is activated), and the user is redirected to the profile page.

**Why this priority:** Subscription is the primary revenue mechanism; must be reliable and self-service.

**Independent Test:** Select a plan on `/k/subscription`. Verify Payment record created with unpaid status. Simulate webhook. Verify wallet credited and subscription activated.

**Acceptance Scenarios:**

1. **Given** the user selects a plan, **When** the payment is initiated, **Then** a Payment record is created, a QR code is displayed, and the user is shown the VA number.
2. **Given** the user completes the bank transfer, **When** SePay sends a valid webhook, **Then** the payment is marked paid, the wallet is credited or subscription activated, and the user is notified.
3. **Given** the webhook amount does not match the expected amount, **When** the webhook is received, **Then** the payment is marked paid but credited as a generic deposit.

**Requirements fulfilled:**

- **FR-003** Initiate subscription purchase — `POST /api/v1/payment/subscription` via `PaymentController.createSubscription`
  **Source:** `examio-be/apps/finance-service/src/payment.controller.ts`
- **FR-004** SePay webhook — `POST /api/v1/webhook/sepay` via `WebhookController.handleSepay`
  **Source:** `examio-be/apps/finance-service/src/webhook.controller.ts`
- **FR-001** View wallet — `GET /api/v1/wallet/details` via `WalletController.getWallet`
  **Source:** `examio-be/apps/finance-service/src/wallet.controller.ts`

**Rules enforced:** BR-001, BR-002, BR-003, BR-004

### Edge Cases

See `edge-cases.md` for the full table of scenarios, expected behavior, and user-facing messages.

## Key Entities

| Entity | Table | Key Columns | Purpose |
|--------|-------|-------------|---------|
| Wallet | `Wallet` | id, userId, balance | Read-only display of credit balance |
| WalletTransaction | `WalletTransaction` | id, walletId, amount, type, direction, description | Immutable ledger; listed in wallet history |
| Payment | `Payment` | id, userId, amount, status, paymentType, vaNumber, orderId, expiresAt | Created on purchase; updated to paid on webhook |
| UserSubscription | `UserSubscription` | id, userId, tier, billingCycle, isActive, lastPaymentDate, nextPaymentDate | Subscription tier gates AI feature access |

## Artifact References

| Artifact | File | Codes Used | Reviewed |
|----------|------|------------|----------|
| System Overview | [system-overview.md](../../docs/system/system-overview.md) | — | [x] |
| Architecture | [architecture.md](../../docs/system/architecture.md) | — | [x] |
| Feature List | [feature-list.md](../../docs/generated/feature-list.md) | F005 | [x] |
| API Map | [api-map.md](../../docs/generated/api-map.md) | — | [ ] |
| Entities | [entities.md](../../docs/generated/entities.md) | MODEL-026, MODEL-027, MODEL-028 | [ ] |
| Screens | [screens.md](../../docs/features/F005_Finance/screens.md) | SCR013/REG003, SCR015 | [ ] |
| Behavior Logic | [behavior-logic.md](../../docs/system/behavior-logic.md) | BL004, BL010, BL011 | [x] |
| Permissions | [permissions.md](../../docs/system/permissions.md) | PERM011, PERM012, PERM013 | [x] |
| User Stories | [user-stories.md](../../docs/generated/user-stories.md) | US012 | [x] |

## Assumptions

- SePay webhook is forwarded through the gateway (BL011) to the finance service (BL010) where it is processed.
- Payment amount is matched to the expected plan price on the webhook payload — mismatches are credited as generic deposits rather than rejected.
- Wallet balance is the source of truth for AI generation credit checks; subscription tier is used for feature gating at the UI level.
- Virtual account numbers expire after a configured window (10 minutes) to prevent indefinite open payment intents.

## Source Code References

| Symbol | Path | Purpose |
|--------|------|---------|
| WebhookController | `examio-be/apps/finance-service/src/webhook.controller.ts` | Receives and processes SePay payment webhook |
| PaymentService | `examio-be/apps/finance-service/src/payment.service.ts` | Payment creation and status management |
| WalletService | `examio-be/apps/finance-service/src/wallet.service.ts` | Wallet balance and transaction ledger |
| FinanceClientService | `examio-be/apps/exam-service/src/modules/finance-client/finance-client.service.ts` | Credit deduction for AI generation |
| SubscriptionPage | `examio-fe/src/pages/k/SubscriptionPage.tsx` | Subscription plan selection and QR payment |
| WalletSection | `examio-fe/src/components/k/WalletSection.tsx` | Wallet balance and transaction history display |

## Unresolved Questions

1. **{Payment expiry}**: The exact expiry time window for the virtual account — not confirmed from source.
2. **{Retry policy}**: Whether SePay retries the webhook if the first delivery fails — not confirmed.
3. **{Refund handling}**: Whether cancelled or disputed payments trigger a refund of wallet credits — not confirmed.
