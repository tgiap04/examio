# F010 - Wallet, Payments & Subscription Benefits Business Context

## Why It Matters
Wallet and subscription handling lets KMAEdu charge for premium usage and unlock paid benefits without manual support intervention. It connects purchase intent, payment confirmation, and access to paid capabilities.

## Who Uses It
Students, teachers, or any authenticated user can review their balance and subscription. The finance system and webhook flow apply payments in the background. Other services use subscription benefits to decide whether paid features are available.

## What They Do
A user opens the subscription area, reviews available benefits, creates a payment, scans or follows payment instructions, and waits for the status to update. When the payment provider confirms the payment, KMAEdu updates the wallet, transaction history, and subscription benefits.

## Known Limits
Production behavior Needs verification for frontend free-mode bypass, exact subscription plan endpoint coverage, payment cancellation, polling timeout, and mobile account-wallet API wiring.
