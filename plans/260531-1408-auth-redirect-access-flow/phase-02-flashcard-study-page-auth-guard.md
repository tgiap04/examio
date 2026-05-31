---
title: "Phase 2: Add auth-before-access-check to FlashcardStudyPage"
description: "Check isAuthenticated before calling checkFlashcardSetAccess — redirect unauthenticated users to /login with ?from= instead of showing access-code modal"
status: completed
priority: P1
effort: 1h
created: 2026-05-31
---

## Context Links

- Report: `/Users/tgiap.dev/devs/examio/plans/reports/researcher-260531-1419-auth-coverage-audit.md`
- FlashcardStudyPage: `examio-fe/src/pages/study-flashcard/FlashcardStudyPage.tsx`
- ProtectedRoute pattern: `examio-fe/src/routes/guards/ProtectedRoute.tsx`
- Auth store: `examio-fe/src/stores/useAuthStore.ts`

## Overview

**Priority:** P1
**Status:** pending

`FlashcardStudyPage` calls `checkFlashcardSetAccess(id)` on mount before checking if the user is authenticated. This forces unauthenticated users to see the access-code modal, enter a code, and then get prompted to log in — at which point they must re-enter the code. The fix: check `isAuthenticated` first; if false, redirect to `/login?from=` the current URL.

## Key Insights

- `FlashcardStudyPage` currently has NO auth imports or hooks — `useAuthStore` is not used
- The page intentionally does NOT use `ProtectedRoute` (it's a "pre-auth gate" experience for public sets)
- The fix is not to wrap in `ProtectedRoute` — that would block unauthenticated users from viewing public flashcard sets entirely
- Instead: add a lightweight auth check INSIDE the page, before the access-check API call, and redirect if not authenticated
- `isAuthenticated` from `useAuthStore` is synchronous; no async overhead for the auth check itself
- If user is authenticated, proceed with the existing `checkFlashcardSetAccess` flow unchanged

## Requirements

- If user is NOT authenticated at page mount, redirect to `/login?from=<current-url>` using `setRedirectBackTarget` + `Navigate`
- If user IS authenticated, proceed with existing `checkFlashcardSetAccess` flow
- The current loading/access-code/locked UI states remain unchanged for authenticated users

## Architecture

```
FlashcardStudyPage mount:
  if (!isAuthenticated) {
    setRedirectBackTarget(currentUrl);
    return <Navigate to="/login?from=<url>" replace />;
  }
  // existing checkFlashcardSetAccess flow
```

## Related Code Files

- `examio-fe/src/pages/study-flashcard/FlashcardStudyPage.tsx` — main file to modify
  - Line 1-40: imports
  - Line 47-76: component state and hook declarations
  - Line 117-149: `useEffect` that calls `checkAccess()` — this is where auth check must be inserted
- `examio-fe/src/lib/authRedirect.ts` — `setRedirectBackTarget` utility
- `examio-fe/src/stores/useAuthStore.ts` — `isAuthenticated` state

## Implementation Steps

### Step 1 — Import `useAuthStore` and `useLocation` in `FlashcardStudyPage`

**File:** `examio-fe/src/pages/study-flashcard/FlashcardStudyPage.tsx`

Add to the existing import from `@/stores/useAuthStore` if not already present, and add `useLocation` to the React Router import:

```ts
import { useNavigate, useParams, useLocation } from "react-router-dom"; // add useLocation
import { useAuthStore } from "@/stores/useAuthStore"; // add
import { setRedirectBackTarget } from "@/lib/authRedirect"; // add
```

### Step 2 — Destructure `isAuthenticated` from `useAuthStore`

**File:** `examio-fe/src/pages/study-flashcard/FlashcardStudyPage.tsx`
**Location:** inside `FlashcardStudyPage` component body

```ts
const { id = "" } = useParams();
const navigate = useNavigate();
const location = useLocation();
const { isAuthenticated } = useAuthStore(); // add
```

### Step 3 — Redirect to login BEFORE access check in `useEffect`

**File:** `examio-fe/src/pages/study-flashcard/FlashcardStudyPage.tsx`
**Location:** inside the `useEffect` at line 117, before the `checkAccess()` call

The current `useEffect` (lines 117-149) starts with:

```ts
useEffect(() => {
  if (!id) { ... return; }

  const checkAccess = async () => { ... };

  checkAccess();
}, [id, loadFlashcards]);
```

Replace with:

```ts
useEffect(() => {
  if (!id) {
    setIsCheckingAccess(false);
    return;
  }

  // Auth-before-access: redirect unauthenticated users to login
  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    setRedirectBackTarget(returnTo);
    navigate(`/login?from=${encodeURIComponent(returnTo)}`, { replace: true });
    setIsCheckingAccess(false);
    return;
  }

  const checkAccess = async () => { ... };

  checkAccess();
}, [id, loadFlashcards, isAuthenticated, location, navigate]);
```

### Step 4 — Add `navigate` to `loadFlashcards` dependency array if needed

The `loadFlashcards` memo has `navigate` captured (for the home button path). Verify `navigate` is stable across renders — since it's from `react-router-dom` it is. No change needed.

## Todo List

- [ ] Import `useAuthStore`, `useLocation`, `setRedirectBackTarget` in `FlashcardStudyPage.tsx`
- [ ] Destructure `isAuthenticated` from `useAuthStore()` call
- [ ] Add `useLocation()` call to get current URL
- [ ] Add auth check and redirect BEFORE `checkAccess()` in `useEffect`
- [ ] Update `useEffect` dependency array to include `isAuthenticated`, `location`, `navigate`
- [ ] Verify the "loading state" still renders while redirecting (no flash of locked UI)

## Success Criteria

1. Unauthenticated user navigates to `/study-flashcard/6a096d05dcdfa3c442410888` → immediately redirected to `/login?from=%2Fstudy-flashcard%2F6a096d05dcdfa3c442410888` — NO access-code modal shown
2. Authenticated user on same URL → existing behavior unchanged (access check, loading state, card display)
3. After login via credentials, user returns to `/study-flashcard/:id` and proceeds with access check normally
4. After login via Google OAuth, user returns to `/study-flashcard/:id` and proceeds with access check normally

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Auth check adds latency to page load | Low | Low | `isAuthenticated` is synchronous; no API call added |
| Redirect inside `useEffect` causes double-render flash | Low | Low | The loading spinner ("Đang kiểm tra quyền truy cập...") still renders until the effect runs |
| Public flashcard sets become inaccessible to unauthenticated users | None | None | The fix only applies when `isAuthenticated === false` — public sets still load for unauthenticated users without hitting this branch |

## Security Considerations

- `setRedirectBackTarget` + URL encoding handles `?from=` properly — no open redirect risk
- `navigate(..., { replace: true })` prevents back-button loops
- No data leakage: unauthenticated users see no flashcard content, only the redirect

## Next Steps

- Phase 3: Add auth-before-access-check to `ExamSessionPage` + audit `ExamQuizPage`
