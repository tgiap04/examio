# Edge Cases — F003_AccountManagement

| Scenario | What Happens | User-Facing Message |
|----------|-------------|---------------------|
| Verification with expired OTP | Expiry check fails; 400 returned | "Verification code has expired. Please request a new one." |
| Verification with invalid OTP | Code not found in database; 400 returned | "Invalid verification code. Please check your email." |
| Verification with already-used OTP | Code already deleted after previous use; 400 returned | "Invalid verification code. Please check your email." |
| Resend verification email | New code generated; old code invalidated; email sent | "A new verification code has been sent to your email." |
| Unverified user visits protected page | Frontend ProtectedRoute redirects to /k/verify | None — silent redirect |
| Unverified user visits /k directly | KRootRedirect redirects to /k/verify | None — silent redirect |
| User requests resend while already verified | isVerified check; no code generated; user proceeds to dashboard | None — silent proceed |
