# F010 - Wallet, Payments & Subscription Benefits Screens

## Screen List
- SCR015 `/k/subscription` - Subscription / Wallet: protected web screen for wallet, subscription plans, QR payment, and transactions.
- SCR114 AccountScreen - Android account/profile/wallet/settings sections; mock-backed UI with API-ready repository.
- SCR211 AccountView - iOS account/profile/wallet/settings sections; mock-backed.

## User Journey
1. Authenticated user opens the subscription or account wallet area.
2. System displays current wallet balance, subscription status, available plans, and transaction history where wired.
3. User selects a payment/subscription option.
4. System creates a payment and shows QR or payment instructions.
5. User completes payment externally.
6. App polls status or refreshes after webhook processing.
7. Wallet balance, transaction history, and subscription benefits update.

## Artifact References
- `screen-list.md` SCR015, SCR114, SCR211.
- `screen-flow.md` FLW052.
- `feature-list.md` F010.
