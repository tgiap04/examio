# FLOW004 - Payment Subscription Flow

## Purpose
Document wallet creation, payment checkout, SePay webhook reconciliation, subscription activation, and benefit checks across finance and dependent services.

## Actors/systems
- Authenticated user
- Web subscription page and QR payment dialog
- Gateway wallet/payment endpoints
- Finance service wallet, payment, and subscription modules
- SePay webhook sender
- Wallet/subscription gRPC services
- RabbitMQ payment/wallet/subscription events
- AI/exam services consuming subscription benefits
- Mobile wallet/account screens, mostly mock-backed despite KMP API presence

## State transitions
- New account -> wallet missing -> wallet created -> balance available. Exact retry/failure behavior Needs verification.
- Payment lifecycle: created -> pending/QR shown -> paid/succeeded or failed/cancelled -> wallet/subscription refreshed. Exact enum values Need verification.
- Webhook lifecycle: SePay callback received -> API key validated -> payment matched -> wallet/subscription updated -> events emitted. Idempotency Needs verification.
- Subscription lifecycle: none/basic/advanced/vip -> activated -> expired/changed. Renewal and downgrade semantics Need verification.
- Benefit check: service request -> finance gRPC `GetUserBenefits` -> allow/limit gated behavior. Exact enforcement points Need verification.

## Trigger types
- User action: open subscription page, create payment, cancel payment, refresh wallet/history.
- Polling: client checks payment status while QR dialog is active.
- External webhook: SePay posts transaction status.
- Backend event: payment, wallet, subscription domain events update downstream state.
- Service-to-service check: AI chat/generation uses subscription benefits.

## Source artifact refs
- `feature-list.md` F010, F001, F006, F007
- `screen-flow.md` FLW052
- `behavior-logic.md` BL060-BL065
- `data-model.md` MODEL006-MODEL009, MODEL032, MODEL033, MODEL037
- `features/f010-wallet-payments-subscription-benefits/technical-spec.md`
- `features/f001-account-authentication-session-management/technical-spec.md`
- `features/f006-ai-file-upload-ocr-content-generation/technical-spec.md`

## Edge cases / Needs verification
- Exact payment status enum and cancellation support.
- Polling timeout/backoff policy.
- Webhook idempotency, duplicate payment handling, and mismatch handling.
- Subscription expiry, renewal, and tier-change semantics.
- Production credit/subscription enforcement while frontend `FREE_MODE = true`.
- Mobile wallet screens are mostly mock-backed; production API wiring Needs verification.
