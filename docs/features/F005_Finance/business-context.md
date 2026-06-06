# Business Context — F005_Finance

## Why It Matters

The platform uses a credit-based virtual currency to gate AI-powered features (quiz and flashcard generation). Credits and subscriptions are managed through a wallet system. Users purchase credits or subscription plans via a SePay virtual account — a Vietnamese payment provider that allows bank transfers. When the bank transfer is confirmed, credits are added to the user's wallet or the subscription is activated. This keeps the platform sustainable while giving users a free tier to explore.

## Who Uses It

- **Free-tier user** — browses the subscription page to see available plans and decide whether to upgrade
- **Paying user** — purchases a plan by scanning a QR code with their banking app, then waits for the transfer to be confirmed and credits to appear
- **Subscriber** — views their current plan, billing cycle, and remaining credits on the profile page

## What They Do

1. User navigates to the subscription page and browses the available plans with pricing and feature details.
2. User selects a plan and confirms the purchase — a virtual account number and QR code are generated.
3. User opens their banking app, scans the QR code, and transfers the payment amount to the virtual account.
4. The bank notifies the platform of the transfer via webhook. Credits are added to the wallet or the subscription is activated.
5. User sees their updated wallet balance and subscription status on their profile page.

## Unresolved Questions

None.
