---
title: "Phase 3: Add auth-before-access-check to ExamSessionPage + audit ExamQuizPage"
description: "Add auth check before checkExamSessionAccessApi in ExamSessionPage, and audit ExamQuizPage for its own auth guard"
status: completed
priority: P1
effort: 1h 15m
created: 2026-05-31
---

## Context Links

- Report: `/Users/tgiap.dev/devs/kmaedu/plans/reports/researcher-260531-1419-auth-coverage-audit.md`
- ExamSessionPage: `kmaedu-fe/src/pages/exam-session/ExamSessionPage.tsx`
- ExamQuizPage: `kmaedu-fe/src/pages/exam-session/ExamQuizPage.tsx`
- Auth store: `kmaedu-fe/src/stores/useAuthStore.ts`
- Auth redirect: `kmaedu-fe/src/lib/authRedirect.ts`

## Overview

**Priority:** P1
**Status:** pending

Two tasks: (1) Apply the same auth-before-access pattern to `ExamSessionPage` — check `isAuthenticated` before calling `checkExamSessionAccessApi`, redirect unauthenticated users to `/login?from=`; (2) Audit `ExamQuizPage` — it has no `ProtectedRoute` wrapper and is a HIGH-sensitivity page (exam answers), so determine whether it needs its own auth guard or a `ProtectedRoute` wrapper.

## Key Insights

### ExamSessionPage

- Mirrors the same pattern as `FlashcardStudyPage` in Phase 2
- Currently has NO auth imports or `useAuthStore` usage
- `loadData` async function inside `useEffect` (lines 44-76) calls `checkExamSessionAccessApi(id)` unconditionally
- Fix: check `isAuthenticated` at the top of `loadData`, redirect before the API call

### ExamQuizPage Audit

- Route at `index.tsx:245-247`: `<ExamQuizPage />` with no wrapper
- `ExamQuizPage` (ExamQuizPage.tsx):
  - Does NOT import `useAuthStore`
  - Does NOT check `isAuthenticated`
  - Does NOT have any auth guard
  - BUT: it calls `startExamAttemptApi(examSessionId, captchaToken)` which uses the shared `api` instance
  - The `api` interceptor will attempt token refresh on 401; if refresh fails, `handleAuthFailure` redirects to `/login` — but ONLY after the user has already entered fullscreen confirmation and captcha
- **Risk**: An unauthenticated user can:
  1. Navigate directly to `/exam-session/:id/quiz`
  2. See the fullscreen confirmation dialog
  3. Enter captcha
  4. Hit the `startExamAttemptApi` call → 401 → redirect to login (after already spending time on captcha)
- **The fix options are mutually exclusive:**
  - Option A (Recommended): Add auth check at the TOP of `ExamQuizPage`'s `useEffect` (before fullscreen dialog), redirect to `/login?from=` — mirrors Phase 2 pattern
  - Option B: Wrap route in `ProtectedRoute` — but this conflicts with the `fullscreenConfirmed` state machine (ProtectedRoute renders `<Navigate>` immediately, not after state updates)
  - Option A is the correct approach

## Requirements

- `ExamSessionPage`: redirect unauthenticated users to `/login?from=` before `checkExamSessionAccessApi` is called
- `ExamQuizPage`: add auth check BEFORE the fullscreen dialog is shown; unauthenticated users get redirected to `/login?from=` without seeing the exam UI

## Architecture

```
ExamSessionPage:
  loadData() {
    if (!isAuthenticated) { redirect; return; }
    checkExamSessionAccessApi(id); ...
  }

ExamQuizPage (useEffect at line 129):
  if (!fullscreenConfirmed || !examSessionId) return;
  // Add: if not authenticated → redirect BEFORE startExamAttemptApi
  initExam() {
    // Add auth check here
    if (!isAuthenticated) {
      redirect("/login?from=" + currentUrl);
      return;
    }
    startExamAttemptApi(...); // only reached if authenticated
  }
```

## Related Code Files

- `kmaedu-fe/src/pages/exam-session/ExamSessionPage.tsx`
  - Lines 1-30: imports — needs `useAuthStore`, `useLocation`, `setRedirectBackTarget`
  - Lines 31-43: component state
  - Lines 44-76: `useEffect` with `loadData` — auth check goes here
- `kmaedu-fe/src/pages/exam-session/ExamQuizPage.tsx`
  - Lines 38-70: component state
  - Lines 129-188: `useEffect` with `initExam` — auth check goes here
- `kmaedu-fe/src/routes/index.tsx` — lines 237-247: route definitions (no changes needed, just for reference)

## Implementation Steps

### Task A — ExamSessionPage: add auth-before-access-check

#### Step A1 — Add imports

**File:** `kmaedu-fe/src/pages/exam-session/ExamSessionPage.tsx`

```ts
import { useNavigate, useParams, useLocation } from "react-router-dom"; // update useNavigate line
import { useAuthStore } from "@/stores/useAuthStore";
import { setRedirectBackTarget } from "@/lib/authRedirect";
```

#### Step A2 — Destructure `isAuthenticated` and add `useLocation`

**File:** `kmaedu-fe/src/pages/exam-session/ExamSessionPage.tsx`
**Location:** inside `ExamSessionPage` component

```ts
const { id = "" } = useParams();
const navigate = useNavigate();
const location = useLocation();               // add
const { isAuthenticated } = useAuthStore();  // add
```

#### Step A3 — Add auth check inside `loadData` BEFORE the API call

**File:** `kmaedu-fe/src/pages/exam-session/ExamSessionPage.tsx`
**Location:** inside the `useEffect` (lines 44-76), at the beginning of `loadData`

Current code:
```ts
const loadData = async () => {
  setLoading(true);
  try {
    const access = await checkExamSessionAccessApi(id);
    ...
```

Replace with:
```ts
const loadData = async () => {
  // Auth-before-access: redirect unauthenticated users to login
  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    setRedirectBackTarget(returnTo);
    navigate(`/login?from=${encodeURIComponent(returnTo)}`, { replace: true });
    return;
  }

  setLoading(true);
  try {
    const access = await checkExamSessionAccessApi(id);
    ...
```

Also update the `useEffect` dependency array (line 76) to include `isAuthenticated`, `location`, `navigate`:
```ts
}, [id, isAuthenticated, location, navigate]);
```

---

### Task B — ExamQuizPage: add auth check before exam init

#### Step B1 — Add imports

**File:** `kmaedu-fe/src/pages/exam-session/ExamQuizPage.tsx`

```ts
import { useNavigate, useParams, useLocation } from "react-router-dom"; // update useNavigate line
import { useAuthStore } from "@/stores/useAuthStore";
import { setRedirectBackTarget } from "@/lib/authRedirect";
```

#### Step B2 — Destructure `isAuthenticated` and add `useLocation`

**File:** `kmaedu-fe/src/pages/exam-session/ExamQuizPage.tsx`
**Location:** inside `ExamQuizPage` component

```ts
const { id: examSessionId = "" } = useParams();
const navigate = useNavigate();
const location = useLocation();               // add
const { isAuthenticated } = useAuthStore();  // add
```

#### Step B3 — Add auth check inside `initExam` BEFORE `startExamAttemptApi`

**File:** `kmaedu-fe/src/pages/exam-session/ExamQuizPage.tsx`
**Location:** inside the `useEffect` (lines 129-188), at the beginning of `initExam`

Current code:
```ts
const initExam = async () => {
  setLoading(true);
  setError(null);

  try {
    const startResult = await startExamAttemptApi(examSessionId, captchaToken || undefined);
    ...
```

Replace with:
```ts
const initExam = async () => {
  // Auth guard: redirect unauthenticated users before showing exam
  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    setRedirectBackTarget(returnTo);
    navigate(`/login?from=${encodeURIComponent(returnTo)}`, { replace: true });
    return;
  }

  setLoading(true);
  setError(null);

  try {
    const startResult = await startExamAttemptApi(examSessionId, captchaToken || undefined);
    ...
```

Also update the `useEffect` dependency array (line 188) to include `isAuthenticated`, `location`, `navigate`:
```ts
}, [examSessionId, fullscreenConfirmed, captchaToken, isAuthenticated, location, navigate]);
```

Note: The `useEffect` already checks `if (!fullscreenConfirmed || !examSessionId) return;` first. The auth check should come AFTER that guard but BEFORE `initExam()` starts. The implementation above places the auth check INSIDE `initExam`, which means `initExam` is still called but exits early. Alternatively, add the check BEFORE calling `initExam()` in the effect:

```ts
useEffect(() => {
  if (!fullscreenConfirmed || !examSessionId) return;

  // Auth guard — must be inside the effect to access isAuthenticated
  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    setRedirectBackTarget(returnTo);
    navigate(`/login?from=${encodeURIComponent(returnTo)}`, { replace: true });
    return;
  }

  initExam();
}, [examSessionId, fullscreenConfirmed, captchaToken, isAuthenticated, location, navigate]);
```

Choose whichever placement is cleaner; both achieve the same result. The guard prevents `startExamAttemptApi` from ever being called unauthenticated.

## Todo List

### Task A — ExamSessionPage
- [ ] Add `useLocation`, `useAuthStore`, `setRedirectBackTarget` imports
- [ ] Destructure `isAuthenticated` from `useAuthStore()` and call `useLocation()`
- [ ] Add auth check in `loadData` BEFORE `checkExamSessionAccessApi` call
- [ ] Update `useEffect` dependency array

### Task B — ExamQuizPage (audit action)
- [ ] Confirm ExamQuizPage has no auth guard (done: confirmed)
- [ ] Add auth check BEFORE `initExam()` in `useEffect` — redirect before fullscreen dialog / captcha shown
- [ ] Verify no `ProtectedRoute` wrapper is needed (not needed — auth check inside component is sufficient)
- [ ] Update `useEffect` dependency array

## Success Criteria

1. Unauthenticated user navigates to `/exam-session/:id` → redirected to `/login?from=%2Fexam-session%2F<id>` before the OTP dialog appears
2. Unauthenticated user navigates to `/exam-session/:id/quiz` → redirected to `/login?from=%2Fexam-session%2F<id>%2Fquiz` before the fullscreen dialog and captcha appear
3. Authenticated users on both pages see unchanged behavior
4. After login on either page, user returns to the correct URL

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Adding auth check to ExamQuizPage prevents resuming in-progress exams for returning unauthenticated users | Low | Medium | Exam quiz access requires prior auth on `ExamSessionPage` first; unauthenticated access to quiz was already broken UX (401 on startExamAttemptApi) |
| Auth check inside `useEffect` causes double-render flash on ExamQuizPage | Low | Low | Loading spinner still renders; the effect runs once per mount |
| `isAuthenticated` is `true` but token is expired → 401 on `startExamAttemptApi` → `handleAuthFailure` triggers → user loses exam progress | Low | High | This is pre-existing behavior; Phase 1 fix ensures the redirect preserves the return URL so they can resume |

## Security Considerations

- `ExamQuizPage` is the highest-sensitivity page in the flow — it contains exam questions and accepts answers
- Adding an auth check here BEFORE any API calls closes the gap where an unauthenticated user could spend time on captcha before being redirected
- `setRedirectBackTarget` + URL encoding is safe (same guard as other phases)
- `navigate(..., { replace: true })` prevents back-button loops

## Next Steps

- After Phase 3: run full auth redirect flow tests (credentials login, OAuth login, SESSION_EXPIRED flow) to verify no regressions
- Consider adding a rate-limit note to the backend team for `/examsessions/study/:id/access` to mitigate ID enumeration (unresolved from researcher report)
