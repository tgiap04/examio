# F010 - Wallet, Payments & Subscription Benefits Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| Wallet missing after registration | Finance wallet creation should run through event/gRPC flow; retry/recovery Needs verification. | Your wallet is being created. Please try again soon. |
| Payment creation fails | No QR/payment instruction is shown; user can retry. | We could not create the payment. Please try again. |
| Payment polling times out | UI stops waiting or asks user to refresh; exact timeout Needs verification. | Payment is still pending. Please check again shortly. |
| Webhook arrives twice | Backend should avoid double-crediting; idempotency Needs verification. | Payment already processed. |
| Webhook API key invalid | Webhook is rejected and payment remains pending. | Payment confirmation could not be verified yet. |
| Payment succeeds but wallet refresh fails | Payment record may be updated, but UI still shows stale balance until refresh. | Payment received. Refreshing your wallet failed. |
| Subscription plan endpoint missing | UI/client referenced endpoint may not match backend route table. | Subscription plans are temporarily unavailable. |
| Free-mode bypass enabled | Frontend may allow usage without credit checks; production policy Needs verification. | Premium checks are currently unavailable. |
