# Screens — F003_AccountManagement

## Screen List

| Screen Name | What User Sees | What User Can Do |
|------------|----------------|-----------------|
| KRootRedirect | Silent redirect — no UI rendered | Redirects authenticated users to /k/my-materials; unauthenticated users to /login |
| VerifyPage | 6-digit OTP input field with resend link | Enter OTP to activate account, or request a new verification email |

## User Journey

1. User completes registration on RegisterPage and is automatically redirected to VerifyPage.
2. User opens their email, copies the 6-digit code, and enters it on VerifyPage.
3. User clicks Verify — on success, they are redirected to `/k/my-materials` and can now access all protected features.
4. If the user did not receive the email, they click "Resend email" on VerifyPage — a new code is sent and the old one is invalidated.
5. User visits any protected page (e.g., `/k/my-materials`) before verifying — the platform redirects them back to VerifyPage.
6. User visits `/k` directly — the KRootRedirect silently sends them to `/k/my-materials` (if authenticated) or `/login` (if not).
