---
title: "Phase 1: Fix api.ts handleAuthFailure bug + add ?from= to SignupForm"
description: "Fix the set-then-clear bug in handleAuthFailure and add ?from= URL param reading to SignupForm"
status: completed
priority: P1
effort: 45m
created: 2026-05-31
---

## Context Links

- Report: `/Users/tgiap.dev/devs/kmaedu/plans/reports/researcher-260531-1419-auth-redirect-flow.md`
- Bug location: `kmaedu-fe/src/apis/api.ts:30-44`
- SignupForm: `kmaedu-fe/src/components/organisms/auth/signup-form.tsx`

## Overview

**Priority:** P1 — data-loss bug
**Status:** pending

Fix two bugs in the auth redirect pipeline: (1) `handleAuthFailure` sets a redirect target then immediately clears it, making the redirect URL always `/k` instead of preserving the user's current page; (2) `SignupForm` does not read `?from=` from the URL, relying only on localStorage which is fragile.

## Key Insights

- `handleAuthFailure` (api.ts:39-43) calls `setRedirectBackTarget()` then `clearRedirectBackTarget()` consecutively — the second call nullifies the first. This affects all `SESSION_EXPIRED` 401 responses.
- `SignupForm` uses `response.redirectTo` (from localStorage) but never reads `?from=` from URL search params, unlike `SigninForm` which already does this correctly (signin-form.tsx:30-39).
- Fixing `handleAuthFailure` is safe — it only removes the erroneous clear; all other logic stays the same.
- Adding `?from=` to `SignupForm` is additive: if URL param exists, it takes priority over localStorage fallback.

## Requirements

- `handleAuthFailure` must preserve the current page URL across the redirect to `/login`
- `SignupForm` must read `?from=` from URL search params and use it as the redirect target after successful registration

## Architecture

```
handleAuthFailure (api.ts)
  BEFORE: setRedirectBackTarget(path) → clearRedirectBackTarget() → navigate("/login")
  AFTER:  setRedirectBackTarget(path) → navigate("/login")

SignupForm (signup-form.tsx)
  BEFORE: window.location.href = response.redirectTo || "/k"
  AFTER:  const from = searchParams.get("from");
          window.location.href = from || response.redirectTo || "/k";
```

## Related Code Files

- `kmaedu-fe/src/apis/api.ts` — lines 30-44 (`handleAuthFailure` function)
- `kmaedu-fe/src/components/organisms/auth/signup-form.tsx` — lines 34-64 (`SignupForm` handleSubmit)

## Implementation Steps

### Step 1 — Fix `handleAuthFailure` in `api.ts`

**File:** `kmaedu-fe/src/apis/api.ts`
**Lines:** 39-43

Remove the `clearRedirectBackTarget()` call on line 41.

```ts
// BEFORE (lines 39-43):
if (window.location.pathname !== "/login") {
  setRedirectBackTarget(getCurrentReturnPath());
  clearRedirectBackTarget();   // BUG — immediately nullifies line above
  navigateTo("/login", true);
}

// AFTER:
if (window.location.pathname !== "/login") {
  setRedirectBackTarget(getCurrentReturnPath());
  navigateTo("/login", true);
}
```

### Step 2 — Add `useSearchParams` import to `SignupForm`

**File:** `kmaedu-fe/src/components/organisms/auth/signup-form.tsx`

Add `useSearchParams` to the React import from "react-router-dom" (currently imports `Link` only).

```ts
import { Link, useSearchParams } from "react-router-dom";
```

### Step 3 — Read `?from=` URL param in `SignupForm`

**File:** `kmaedu-fe/src/components/organisms/auth/signup-form.tsx`
**Location:** inside `SignupForm` function, before `handleSubmit`

Add the hook call and use it in `handleSubmit`:

```ts
// Inside SignupForm component:
const [searchParams] = useSearchParams();

// In handleSubmit, replace the redirect line:
// BEFORE:
window.location.href = response.redirectTo || "/k";
// AFTER:
const from = searchParams.get("from");
window.location.href = from || response.redirectTo || "/k";
```

## Todo List

- [ ] Remove `clearRedirectBackTarget()` call from `handleAuthFailure` in `api.ts`
- [ ] Add `useSearchParams` import to `SignupForm`
- [ ] Read `?from=` from URL params and apply in `handleSubmit`

## Success Criteria

1. `SESSION_EXPIRED` 401 response → `handleAuthFailure` calls `setRedirectBackTarget` and navigates to `/login` without clearing — `getRedirectBackTarget()` returns the original page URL
2. Registering from `/register?from=/k/my-materials` → after registration, user lands on `/k/my-materials` (URL param wins over localStorage)
3. Registering from `/register` with no `?from=` → falls back to `response.redirectTo` from localStorage (existing behavior preserved)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `handleAuthFailure` fix breaks other redirect flows | Low | Medium | Fix is purely subtractive — only removes a clear call; behavior changes only for `SESSION_EXPIRED` path |
| `SignupForm` redirect priority change causes unexpected redirect | Low | Low | URL param is additive — localStorage fallback still works |

## Security Considerations

- `from` param is a relative path; `normalizeReturnPath` in `authRedirect.ts` already guards against protocol-relative or absolute URLs (`//` → `/k`)
- No new attack surface introduced

## Next Steps

- Phase 2: Add auth-before-access-check to `FlashcardStudyPage`
- Phase 3: Add auth-before-access-check to `ExamSessionPage` + audit `ExamQuizPage`
