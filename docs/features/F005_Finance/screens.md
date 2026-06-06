# Screens — F005_Finance

## Screen List

| Screen Name | What User Sees | What User Can Do |
|------------|----------------|-----------------|
| ProfilePage / SubscriptionWallet (REG003) | Current subscription tier, wallet balance, and recent transactions | View subscription status and wallet balance |
| SubscriptionPage | Available subscription plans with pricing and QR payment dialog | Select a plan and initiate payment via SePay |

## User Journey

1. User navigates to `/k/profile` and views the SubscriptionWallet section showing their current subscription tier, credit balance, and recent transaction history.
2. User clicks "Manage Subscription" and is taken to `/k/subscription` — the SubscriptionPage.
3. User browses the available plans and clicks "Choose Plan" on the desired tier.
4. A QR code dialog appears showing the SePay virtual account number and a scannable QR code.
5. User opens their banking app, scans the QR code, and completes the bank transfer.
6. The platform receives the webhook notification, confirms the payment, and activates credits or the subscription.
7. User is redirected back to the profile page where their updated balance and subscription status are now visible.
