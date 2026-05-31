# Auth Coverage Audit: `/study-flashcard/:id`, `/exam-session/:id`

## Summary

`/study-flashcard/:id`, `/exam-session/:id`, and `/exam-session/:id/quiz` are the only three non-public routes missing `ProtectedRoute`. However, the absence of `ProtectedRoute` is **intentional by design** — these pages serve as "pre-auth gate" experiences where unauthenticated users land, see a locked/access-code UI, and optionally enter a code before being redirected to login if needed. The backend enforces real access control (session ownership, whitelist) via the same authenticated `api` instance used for all requests.

---

## Findings

### 1. Route Protection Status

| Route | ProtectedRoute | Notes |
|---|---|---|
| `/study-flashcard/:id` | **NO** | Intentional |
| `/exam-session/:id` | **NO** | Intentional |
| `/exam-session/:id/quiz` | **NO** | Intentional |
| All `/k/*` routes | YES | Full coverage |

Routes `index.tsx` lines 237-247:

```tsx
// NO wrapper — intentionally public-facing
{ path: "/study-flashcard/:id",          element: <FlashcardStudyPage /> },
{ path: "/exam-session/:id",             element: <ExamSessionPage /> },
{ path: "/exam-session/:id/quiz",        element: <ExamQuizPage /> },
```

---

### 2. FlashcardStudyPage Auth Usage

- **`useAuthStore`**: NOT imported or used anywhere in `FlashcardStudyPage.tsx`.
- **No auth guard before `checkFlashcardSetAccess`** — calls on mount unconditionally.
- **Access flow**: Mounts → calls `checkFlashcardSetAccess(id)` → if `hasAccess` loads cards; if `requiresCode` shows access-code modal; if `!hasAccess && !requiresCode` shows locked UI.
- Works for unauthenticated users (they see locked UI, not a blank redirect).
- After entering a valid access code, `loadFlashcards(id, code)` is called — still no auth required since the backend validates the code independently.

---

### 3. ExamSessionPage Auth Usage

- **`useAuthStore`**: NOT imported or used anywhere.
- **No auth guard before `checkExamSessionAccessApi`** — calls on mount unconditionally.
- **Access flow**: Mounts → calls `checkExamSessionAccessApi(id)` → if `hasAccess` loads stats; if `accessType === "code_required"` shows OTP access-code dialog; if `accessType === "denied"` shows locked card.

---

### 4. API Auth Headers & 401 Behavior

Both `checkFlashcardSetAccess` and `checkExamSessionAccessApi` use the shared `api` instance:

- `api.ts:89-103` — `authRequestInterceptor` attaches `Bearer <token>` from `localStorage.getItem("auth_token")` to every request.
- Unauthenticated users: token absent → requests go without auth header.
- `api.ts:112-132` — 401 interceptor attempts token refresh; if refresh fails, calls `handleAuthFailure()` → clears tokens, redirects to `/login`.
- `api.ts:136-155` — `SESSION_INVALIDATED` / `SESSION_EXPIRED` codes also redirect to `/login`.
- Neither `flashcardSetApi.ts` nor `examSessionApi.ts` has custom 401 handling — all delegation to the global interceptor.

**What happens for unauthenticated user on `/study-flashcard/:id`?**
1. Request sent without auth header.
2. Backend evaluates access (public set → granted; private/whitelist → denied or code_required).
3. If denied: shows locked UI. No redirect to login.
4. If code_required: shows access-code modal. After valid code entered, flashcards load via `getFlashcardSetForStudy(id, code)` — no auth needed.

**What happens for unauthenticated user on `/exam-session/:id`?**
Same pattern: backend enforces access. Unauthenticated users can view the locked/code-entry UI but cannot proceed to the actual exam.

---

### 5. `/exam-session/:id/quiz` — ExamQuizPage

Route has no `ProtectedRoute`. Let me flag whether `ExamQuizPage` itself checks auth:

*(ExamQuizPage not in the read list — audit scope limited to specified files. Flagging as unresolved.)*

---

### 6. Unprotected Routes Summary

| Route | Risk Level | Reason |
|---|---|---|
| `/study-flashcard/:id` | **Low** | Intentional pre-auth experience; backend enforces access |
| `/exam-session/:id` | **Low** | Intentional pre-auth experience; backend enforces access |
| `/exam-session/:id/quiz` | **Medium** | QUIZ page — unclear if ExamQuizPage has its own auth guard |

---

## Architectural Pattern: "Access-Code-Before-Auth"

These three routes embody a deliberate UX pattern:

```
User lands on /study-flashcard/:id (no auth)
  → checkFlashcardSetAccess() → "public" or "requiresCode"
    → If public: load and show flashcards (no auth needed — backend allows)
    → If code_required: show access-code modal
      → Valid code entered → load flashcards (no auth needed)
      → Otherwise: stays on locked UI
```

This means **public flashcard sets are accessible to anyone with the link**, without login. This is likely intentional for shared/public study links.

The "anti-pattern" concern would only be real if:
1. Private/user-specific content is leaking before auth check.
2. The `/quiz` page allows progressing to actual exam answers without auth.

---

## Unresolved Questions

1. **ExamQuizPage auth guard**: Does `ExamQuizPage.tsx` (not read) check auth before rendering the active quiz? If not, this is the highest-risk gap — actual exam answers could be accessed by anyone with the session ID.
2. **Backend `/study/:id/access` semantics**: Are these endpoints truly public (no auth required), or do they simply tolerate unauthenticated requests but return degraded responses?
3. **Public vs. private flashcard sets**: Is a user with an access code but no account able to study a private flashcard set? If yes, is that the intended behavior?
4. **Session fixation / ID enumeration**: Do these routes leak information via 404 vs. 200 responses (i.e., can an attacker enumerate valid flashcard/exam session IDs)?

---

## Recommendation

The current design appears intentional — `ProtectedRoute` would break the access-code-before-auth UX for public shares. The real security boundary is at the **backend**, not the frontend route layer.

**Action items**:
- Audit `ExamQuizPage.tsx` for auth checks before rendering quiz questions.
- Confirm with backend team that `/study/:id/access` and `/examsessions/study/:id/access` treat unauthenticated requests correctly (return appropriate `accessType`, not data).
- Add rate-limiting on access-check endpoints to mitigate ID enumeration.
