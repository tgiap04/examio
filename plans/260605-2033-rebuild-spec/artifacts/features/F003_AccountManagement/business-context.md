# Business Context — F003_AccountManagement

## Why It Matters

Email verification confirms that the user owns the email address they registered with, preventing fake accounts and protecting platform integrity. Until verification is complete, the account is restricted — the user cannot access study materials, take exams, or use AI tools. This gate ensures that all active platform users have a verifiable identity.

## Who Uses It

- **New registered user** — enters the 6-digit code from their verification email to activate their account and unlock all platform features
- **User who did not receive the email** — requests a new verification email to be sent

## What They Do

1. New user registers an account on the platform (via F002) and is immediately redirected to the verification page.
2. The user opens their email inbox, finds the message from the platform, and copies the 6-digit verification code.
3. The user enters the code on the verification page and clicks Verify — on success, their account is activated and they are taken to their dashboard.
4. If the user did not receive the email, they click "Resend" and a new code is sent to their inbox.
5. When the user visits any protected page (e.g., `/k/my-materials`) without verifying, they are redirected back to the verification page until their account is activated.

## Unresolved Questions

None.
