# F010 - Wallet, Payments & Subscription Benefits Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| Wallet missing after registration | Finance wallet creation should run through event/gRPC flow; retry/recovery Needs verification. | Your wallet is being created. Please try again soon. |
| Payment creation fails | No QR/payment instruction is shown; user can retry. | We could not create the payment. Please try again. |
| Payment polling times out | UI stops waiting or asks user to refresh; exact timeout Needs verification. | Payment is still pending. Please check again shortly. |
| Webhook arrives twice | Backend should avoid double-crediting; idempotency Needs verification. | Payment already processed. |
| Webhook API key invalid | Webhook throws `UnauthorizedException` using `crypto.timingSafeEqual` for comparison (timing-attack safe). Payment remains pending. | Invalid API key |
| Payment succeeds but wallet refresh fails | Payment record may be updated, but UI still shows stale balance until refresh. | Payment received. Refreshing your wallet failed. |
| Subscription plan endpoint missing | UI/client referenced endpoint may not match backend route table. | Subscription plans are temporarily unavailable. |
| Free-mode bypass disabled | `FREE_MODE = false` in production; all credit and subscription checks are enforced. Flag is strictly development-only and must never be `true` in production commits. | Premium checks are currently unavailable. |
