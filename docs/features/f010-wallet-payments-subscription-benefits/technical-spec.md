# F010 - Wallet, Payments & Subscription Benefits Technical Spec

## Functional Requirements
- FR001: Show authenticated users wallet balance, subscription status, plans, and transaction history.
- FR002: Create a payment for credits or subscription benefits and display QR/payment instructions.
- FR003: Poll payment status and refresh wallet/subscription state after completion.
- FR004: Cancel pending payments where supported; exact cancellation route and states Need verification.
- FR005: Process SePay webhooks to update payment, wallet balance, transaction history, and subscription activation.
- FR006: Expose subscription benefits to other services through finance gRPC.

## Business Rules
- BR001: Users can view only their own wallet, payments, and subscription information. Linked FR: FR001-FR004.
- BR002: New user registration triggers wallet creation through event/gRPC-backed finance workflow. Linked FR: FR001.
- BR003: Webhook calls require API-key protection — validated via `crypto.timingSafeEqual` to prevent timing attacks. Invalid API keys throw `UnauthorizedException` (not silent failure). Linked FR: FR005, SEC002.
- BR004: `FREE_MODE = false` (disabled) in production — credit and subscription checks are fully enforced. This flag is strictly development-only and must never be `true` in production commits. Linked FR: FR001, FR006, SEC001.
- BR005: Payment success/failure must be reflected in wallet/subscription events and persisted records. Linked FR: FR003, FR005.
- BR006: Critical environment variables (`QUIZ_JWT_SECRET`, `QUIZ_AES_KEY`) are validated at startup — service fails to initialize if missing or invalid, preventing silent fallback to weak defaults. Linked FR: SEC001.

## State Machines
- SM001: Payment lifecycle: created -> pending/QR shown -> paid/succeeded or failed/cancelled -> wallet/subscription refreshed. Exact enum values Need verification. Linked FR: FR002-FR005.
- SM002: Subscription lifecycle: none/basic/advanced/vip -> activated -> expired/changed. Exact expiry renewal behavior Needs verification. Linked FR: FR001, FR005, FR006.
- SM003: Wallet lifecycle: missing on new account -> created -> balance updated -> transaction recorded. Linked FR: FR001, FR005.

## Algorithms
- ALG001: Payment status polling repeatedly checks payment state until success, failure, cancellation, or timeout. Timeout/backoff policy Needs verification. Linked FR: FR003.
- ALG002: Webhook reconciliation maps SePay callback data to a Payment record, then applies wallet/subscription updates idempotently; idempotency details Need verification. Linked FR: FR005.

## Integrations
- INT001: Web route `/k/subscription` presents wallet, plans, QR payment, and transactions. Linked FR: FR001-FR004.
- INT002: Wallet/Payments/Subscription API (API016) uses `/api/v1/wallet/*`, `/api/v1/payment/*`, and gRPC wallet/subscription methods. Linked FR: FR001-FR006.
- INT003: External Webhook API (API017) accepts `POST /webhook/sepay`. Linked FR: FR005.
- INT004: Service events include `payment.success`, `payment.failed`, `wallet.created`, `wallet.updated`, `subscription.activated`, and `subscription.expired`. Linked FR: FR005.
- INT005: Mobile KMP `WalletApiService` exists; account wallet views are mostly mock-backed. Linked FR: FR001.

## Key Entities
- MODEL006 Wallet: user wallet balance, one-to-one with User.
- MODEL007 WalletTransaction: amount, type, direction (`ADD`/`SUBTRACT`).
- MODEL008 Payment: amount, currency, status, paymentType, SePay virtual account data.
- MODEL009 UserSubscription: tier values `0=none`, `1=basic`, `2=advanced`, `3=vip`.
- MODEL032 wallet.proto: `CreateWallet`, `GetWallet`, `UpdateBalance`.
- MODEL033 subscription.proto: `GetUserBenefits`.

## Artifact References
- `feature-list.md` F010.
- `user-stories.md` US016, US017.
- `screen-list.md` SCR015, SCR114, SCR211.
- `screen-flow.md` FLW052.
- `behavior-logic.md` BL060, BL061, BL063, BL064.
- `data-model.md` MODEL006-MODEL009, MODEL032, MODEL033, MODEL037.
- `api-map.md` API016, API017.
- `permissions.md` PERM012.
- Source paths cited by artifacts: web `subscriptionApi.ts`, KMP `WalletApiService`, Account screens; exact source paths Need verification.
