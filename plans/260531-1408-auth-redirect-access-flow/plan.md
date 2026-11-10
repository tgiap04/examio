---
title: "Fix auth redirect and access flow"
description: "Fix api.ts handleAuthFailure bug, add ?from= to SignupForm, and add auth-before-access-check to study/exam pages"
status: completed
priority: P1
effort: 3h
branch: main
tags: [auth, frontend, redirect, ux]
created: 2026-05-31
---

## Overview

Three bugs: (1) `api.ts:41` clears redirect target immediately after setting it — `SESSION_EXPIRED` 401 flow loses return URL; (2) `SignupForm` doesn't read `?from=` from URL — fragile fallback only; (3) `FlashcardStudyPage` and `ExamSessionPage` call access-check APIs before verifying auth, forcing unauthenticated users to re-enter access codes after login.

## Phases

| Phase | Description | Status |
|-------|-------------|--------|
| [Phase 1](phase-01-fix-api-bug-and-signup-form.md) | Fix `handleAuthFailure` in `api.ts` + add `?from=` URL param reading to `SignupForm` | completed |
| [Phase 2](phase-02-flashcard-study-page-auth-guard.md) | Add auth-before-access-check to `FlashcardStudyPage` | completed |
| [Phase 3](phase-03-exam-session-page-auth-guard-and-quiz-audit.md) | Add auth-before-access-check to `ExamSessionPage` + audit `ExamQuizPage` | completed |

## Key Changes

- `kmaedu-fe/src/apis/api.ts` — remove erroneous `clearRedirectBackTarget()` in `handleAuthFailure`
- `kmaedu-fe/src/components/organisms/auth/signup-form.tsx` — read `?from=` URL param, apply alongside `response.redirectTo`
- `kmaedu-fe/src/pages/study-flashcard/FlashcardStudyPage.tsx` — check `isAuthenticated` before calling `checkFlashcardSetAccess`
- `kmaedu-fe/src/pages/exam-session/ExamSessionPage.tsx` — check `isAuthenticated` before calling `checkExamSessionAccessApi`
- `kmaedu-fe/src/pages/exam-session/ExamQuizPage.tsx` — audit: check if needs auth guard or ProtectedRoute wrapper

## Success Criteria

1. `SESSION_EXPIRED` 401 → redirects to `/login?from=<current-url>` — user returns to correct page after login
2. `SignupForm` reads `?from=` URL param (not just localStorage)
3. Unauthenticated user on `/study-flashcard/:id` → redirected to `/login?from=%2Fstudy-flashcard%2F<id>` (no access-code modal shown first)
4. Unauthenticated user on `/exam-session/:id` → redirected to `/login?from=%2Fexam-session%2F<id>` (no OTP modal shown first)
5. `ExamQuizPage` auth status confirmed — either has its own guard or is wrapped in `ProtectedRoute`
6. No regressions to existing auth redirect flows (credentials login, OAuth, credentials signup)

## Risks

- **FlashcardStudyPage / ExamSessionPage**: adding `isAuthenticated` check delays access check by one async call — acceptable UX trade-off
- **ExamQuizPage**: wrapping in `ProtectedRoute` would break the `fullscreenConfirmed` state machine — must verify before wrapping
