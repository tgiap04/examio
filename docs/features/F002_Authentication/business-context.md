# Business Context — F002_Authentication

## Why It Matters

Authentication is the gatekeeper for all protected platform features. Users need a reliable, secure way to create accounts, log in, and recover access when they forget their password. The platform supports both traditional email/password credentials and Google OAuth to reduce friction and increase conversion. The gateway rate limit on credential routes (5 requests per minute) limits automated fake account creation.

## Who Uses It

- **New visitor** — creates an account with email and password, passes bot protection, and receives a verification code to activate their account
- **Returning user (email/password)** — logs in with their email and password credentials
- **Returning user (Google)** — logs in with their Google account without needing a platform password
- **User who forgot password** — requests a reset code via email, then resets their password using the code

## What They Do

1. New visitor clicks Register on the home page and fills in email, password, and username on the registration page.
2. The platform creates the account, sends a 6-digit verification code to the email, and redirects the user to the verification page.
3. The user opens their email, copies the 6-digit code, enters it on the verification page, and their account becomes active.
4. Returning user clicks Login and enters email and password — or clicks the Google sign-in button for OAuth.
5. On successful login, the platform creates a session record with device information, stores tokens in the browser, and redirects the user to their dashboard.
6. User who forgot their password clicks "Forgot password" on the login page, enters their email, receives a reset code by email, and resets their password using that code.

## Unresolved Questions

None.