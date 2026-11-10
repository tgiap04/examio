---
title: "Phase 04: i18n Auth Pages"
description: "Replace hardcoded Vietnamese strings in SigninForm, SignupForm, ForgotPasswordPage, and ResetPasswordPage"
status: completed
priority: P1
effort: 1.5h
tags: [i18n, auth, signin, signup, password-reset]
---

# Phase 04: i18n Auth Pages

## Context Links

- [plan.md](./plan.md) — overview
- [phase-01](./phase-01-install-config.md) — i18n config (must complete first)
- [phase-02](./phase-02-translation-files.md) — locale JSON files (must complete first)

## Overview

Replace all hardcoded Vietnamese strings in the 4 auth-related components with `useTranslation('auth')` hook calls. This covers the login, register, forgot password, and reset password flows.

**Priority:** P1
**Status:** completed

## Key Insights

- `SigninForm` and `SignupForm` are in `src/components/organisms/auth/`
- `ForgotPasswordPage` and `ResetPasswordPage` are in `src/pages/auth/`
- `SignupForm` has a hardcoded `toast.warning("Mat khau nhap lai khong khop!")` — must use `t()` with interpolation
- `LoginPage.tsx` has a Suspense fallback string `"Dang tai..."` — translate it
- `ResetPasswordPage` has a success state with multiple translated strings
- All auth pages share the same pattern: `useTranslation('auth')` + `t('key')` calls

## Requirements

### Functional
- All visible text in auth pages uses `t()` calls
- Toast warning messages also translated
- Placeholder text in form inputs translated
- `aria-label` attributes translated
- `minLength` validation messages (if any) translated

### Non-functional
- No layout shift or visual regression
- Auth form behavior unchanged (submit, validation, redirects)
- Error messages from API remain in English (backend-owned)

## Architecture

### Component Tree
```
PublicRoute
  └─ AuthLayout
       ├─ LoginPage
       │    └─ SigninForm
       ├─ RegisterPage
       │    └─ SignupForm
       ├─ ForgotPasswordPage
       └─ ResetPasswordPage
```

## Related Code Files

### Files to Modify
- `kmaedu-fe/src/components/organisms/auth/signin-form.tsx` (~10 strings)
- `kmaedu-fe/src/components/organisms/auth/signup-form.tsx` (~12 strings)
- `kmaedu-fe/src/pages/auth/ForgotPasswordPage.tsx` (~7 strings)
- `kmaedu-fe/src/pages/auth/ResetPasswordPage.tsx` (~15 strings)
- `kmaedu-fe/src/pages/auth/LoginPage.tsx` (~1 string — Suspense fallback)

## Todo List

- [x] SigninForm: replace all 10+ strings with `t()` calls
- [x] SignupForm: replace all 12+ strings with `t()` calls
- [x] SignupForm: translate toast.warning message
- [x] ForgotPasswordPage: replace all 7 strings with `t()` calls
- [x] ResetPasswordPage: replace all 15 strings with `t()` calls
- [x] LoginPage: replace Suspense fallback string
- [x] Run `yarn build` — verify no errors
- [x] Manual test: switch language, verify all auth page text updates

## Success Criteria

- [x] Zero hardcoded Vietnamese strings in all 5 modified files
- [x] Toast warning in SignupForm translates correctly
- [x] Form labels, placeholders, buttons, headings all update on language switch
- [x] No layout shift or visual regression
- [x] Auth form behavior (submit, validation, redirects) unchanged
- [x] `yarn build` passes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Toast warning not translating (outside React tree) | Low | Medium | `toast.warning(t('key'))` — t() is called at invocation time, not render time |
| Form validation messages from backend | Low | Low | Backend messages stay in English — only client-side messages translated |
| `Suspense` fallback needs context | Low | Low | Use inline `useTranslation` in LoginPage, or leave fallback as-is |

## Security Considerations

- Client-side validation messages are not security-sensitive
- Backend error messages (shown via API response) are not in scope

## Next Steps

- Phase 05: Extract LanguageSwitcher component from HeaderSection
- Phase 06: Legal and content pages
