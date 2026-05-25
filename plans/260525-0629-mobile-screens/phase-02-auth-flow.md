---
title: "Phase 2: Auth Flow"
description: "Login, Register, ForgotPassword, ResetPassword screens on iOS and Android"
status: pending
priority: P1
effort: 12h
---

# Phase 2: Auth Flow

## Context

- [Frontend auth API](../../examio-fe/src/apis/authApi.ts)
- [Frontend auth store](../../examio-fe/src/stores/useAuthStore.ts)
- [Shared session models](../../examio-app/shared/src/commonMain/kotlin/com/examio/app/core/session/SessionModels.kt)
- Depends on: Phase 1 (shared models + AuthRepository)

## Overview

Implement pre-tab authentication screens. When user is unauthenticated, app shows auth flow instead of tab bar. Covers login (email/username + password), registration, forgot password (send code), and reset password (code + new password).

## Requirements

### Functional
- Login with credential (email/username/phone) + password
- Register with username + email + password
- Forgot password: enter email -> receive code
- Reset password: enter code + new password
- OAuth login (Google) via system browser redirect
- Persist session tokens securely
- Auto-login on app launch if valid tokens exist

### Non-Functional
- Form validation client-side before API call
- Loading states during API calls
- Error messages from backend displayed inline
- Keyboard handling (scroll to focused field)

## API Endpoints Used

| Endpoint | Screen |
|----------|--------|
| `POST /auth/login` | Login |
| `POST /auth/register` | Register |
| `POST /auth/send-code-reset-password` | ForgotPassword |
| `POST /auth/reset-password` | ResetPassword |
| `POST /auth/refresh` | Auto-login |
| `GET /auth/me` | Session validation |

## Files to Create

### iOS (`iosApp/ExamioApp/Features/Auth/`)

| File | Purpose |
|------|---------|
| `AuthFlowView.swift` | Navigation container for auth screens |
| `LoginView.swift` | Login form |
| `RegisterView.swift` | Registration form |
| `ForgotPasswordView.swift` | Email input for reset code |
| `ResetPasswordView.swift` | Code + new password form |
| `AuthViewModel.swift` | Shared ViewModel for auth state |

### Android (`androidApp/src/main/kotlin/com/examio/app/features/auth/`)

| File | Purpose |
|------|---------|
| `AuthNavGraph.kt` | Navigation graph for auth screens |
| `LoginScreen.kt` | Login form |
| `RegisterScreen.kt` | Registration form |
| `ForgotPasswordScreen.kt` | Email input for reset code |
| `ResetPasswordScreen.kt` | Code + new password form |
| `AuthViewModel.kt` | ViewModel for auth state |

### Files to Modify

| File | Change |
|------|--------|
| `iosApp/ExamioApp/ContentView.swift` | Add auth state check; show AuthFlowView when unauthenticated |
| `androidApp/.../ExamioApp.kt` | Add auth state check; show auth nav graph when unauthenticated |

## Implementation Steps

1. Create `AuthViewModel` (both platforms) consuming `AuthRepository` from shared
2. Implement `LoginView/Screen` with credential + password fields, login button, error display
3. Implement `RegisterView/Screen` with username + email + password fields
4. Implement `ForgotPasswordView/Screen` with email field + send code button
5. Implement `ResetPasswordView/Screen` with code + new password fields
6. Wire auth flow navigation (login <-> register, login -> forgot -> reset)
7. Modify root app view to check auth state and show auth flow or tab bar
8. Implement auto-login: on launch, check stored tokens -> call `/auth/me` -> proceed or show login
9. Handle OAuth: open system browser to backend OAuth URL, handle redirect back

## Data Flow

```
LoginView -> AuthViewModel.login(credential, password)
  -> AuthRepository.login()
    -> AuthApiService.login()
      -> Backend /auth/login
    <- LoginResponse { token, refreshToken, user }
  -> SecureTokenStorage.saveTokens()
  -> Update auth state -> UI navigates to main tabs
```

## Success Criteria

- [ ] Login with valid credentials navigates to main tabs
- [ ] Login with invalid credentials shows error message
- [ ] Register creates account and auto-logs in
- [ ] Forgot password sends code to email
- [ ] Reset password with valid code changes password
- [ ] App auto-logs in on relaunch with valid stored tokens
- [ ] 401 during auto-login clears tokens and shows login

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| OAuth redirect handling differs per platform | Use ASWebAuthenticationSession (iOS) / Custom Tabs (Android) |
| Token refresh during background -> foreground | Check token validity on app foreground event |

## Rollback

Auth screens are isolated. Revert = restore original ContentView/ExamioApp that always shows tabs.
