# Screens — F002_Authentication

## Screen List

| Screen Name | What User Sees | What User Can Do |
|------------|----------------|-----------------|
| LoginPage | Email/password form and Google OAuth sign-in button | Sign in with email/password or Google OAuth |
| RegisterPage | Registration form (email, password, username) with Turnstile challenge | Create a new account |
| ForgotPasswordPage | Email input field to request a password reset code | Request a password reset OTP |
| ResetPasswordPage | 6-digit OTP input and new password field | Reset password using the OTP |

## User Journey

1. User arrives at LoginPage and sees the email/password form alongside the Google sign-in button.
2. User enters their email and password and clicks Sign In — on success, they are redirected to `/k/my-materials`.
3. Alternatively, user clicks the Google sign-in button → platform initiates Google OAuth flow → on success, redirected to `/k/my-materials`.
4. User who does not have an account clicks Register → navigated to RegisterPage.
5. User fills in email, password, and username, completes the Turnstile challenge, and clicks Register → verification email sent → redirected to VerifyPage.
6. User who forgot their password clicks "Forgot password" on LoginPage → navigated to ForgotPasswordPage.
7. User enters their email and clicks Send → reset code sent to email → redirected to ResetPasswordPage.
8. User enters the 6-digit OTP and a new password → on success, redirected to LoginPage to sign in with the new password.