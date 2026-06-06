# Edge Cases — F002_Authentication

| Scenario | What Happens | User-Facing Message |
|----------|-------------|---------------------|
| Login with wrong password | Credentials check fails; generic error returned | "Invalid email or password." |
| Login with non-existent email | User lookup fails; generic error returned | "Invalid email or password." |
| Registration without Turnstile token | Controller rejects with 400 before account creation | "Bot protection failed. Please try again." |
| Registration with duplicate email | Unique constraint violation; validation error returned | "This email is already registered." |
| Forgot password with unregistered email | User lookup fails; generic response returned (security) | "If this email is registered, a reset code has been sent." |
| Password reset with expired OTP | Expiry check fails; 400 returned | "Reset code has expired. Please request a new one." |
| Password reset with invalid OTP | Code not found; 400 returned | "Invalid reset code. Please check your email." |
| New password does not meet strength requirements | Validation fails; 400 returned | "Password must be at least 8 characters and include a number." |
| Authenticated user visits /login | AuthGuard detects valid session; redirects to /k/my-materials | None — silent redirect |
| OAuth callback with expired/invalid state | OAuth state validation fails; error shown | "Sign-in failed. Please try again." |
| Session token expired during use | Middleware returns 401; frontend clears tokens and redirects to login | "Your session has expired. Please log in again." |