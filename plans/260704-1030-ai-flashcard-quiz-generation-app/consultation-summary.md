# Consultation — AI Flashcard/Quiz Generation for examio-app

**Date:** 2026-07-04 · **Lens:** CTO (default) · **Status:** design recorded, awaiting user confirmation of assumptions

## The Commission (as stated)
"Add a flashcard/quiz generation feature to `examio-app` like the one in `examio-fe`, reusing `examio-be`."

## The Reframe (key finding)
The feature is **~80% already implemented in `examio-app`, on both platforms** — but it is **orphaned** (not wired into DI or navigation). This is not a build-from-scratch job; it is **wire-up + contract-verify + finish the save/navigation seam**.

What already exists:
- **Shared KMP** (`shared/.../features/ai/`): `AIGeneratorApiService` (`generate-from-file`, `regenerate/{id}`, `job/{id}`, `recent-uploads`, `upload/{id}`), DTOs (`AIGeneratorModels.kt`), `AiJobPoller` (exponential-backoff polling), `AIChatRepository`.
- **Android**: `AiScreen.kt` + `AIToolViewModel.kt` — document picker, type/quantity/keyword controls, progress.
- **iOS**: `AiView.swift` + `AIToolViewModel.swift` — Swift-native equivalent.
- Multipart PDF upload, bearer + `X-Device-ID` auth, job polling — all present and matching the gateway contract the FE uses.

Why it doesn't work today:
1. Android: `AIChatRepository`/`AIGeneratorApiService` never constructed in `AndroidAppContainer.kt`; no screen renders `AiScreen`.
2. Both platforms: no navigation entry (no AI tab, no launch button).
3. Post-generation seam likely missing: job returns `historyId` + `type` but nothing routes it into save-to-set / view-set.

## Backend contract (reused as-is, no BE changes)
- Flow: `POST /ai/generate-from-file` (multipart PDF, `typeResult` 1=quiz/2=flashcard, `quantityQuizz|quantityFlashcard` ≤50, `isNarrowSearch`, `keyword`) → `{jobId}` → poll `GET /ai/job/{jobId}` until `completed` → `result.{quizzes|flashcards}` + `historyId`.
- Regenerate: `POST /ai/regenerate/{uploadId}`.
- Persist: `POST /quizsets/save-history-to-quizset` / `POST /flashcardsets/save-history-to-flashcardset` with `{setIds[], historyId, labelId|labelName+labelColor}`.
- Constraints: PDF only, ≤5MB (exam-service), ≤50 pages (FE client check), single-answer MCQ only, no difficulty, **no streaming** (polling).
- Quota: `FREE_MODE=true` in BE → credits bypassed today. Redis lock allows 1 active quiz + 1 flashcard job per user.
- Gating: gateway `PageEnabledGuard` toggles `ai-tool` / `manage-exam` / `flash-card` (404 if disabled). FE additionally gates `/k/ai-tool` behind teacher role.

## Paths Examined
1. **Wire existing code + finish save seam (MVP)** — lowest risk/effort, ships the core loop. *Recommended.*
2. **Full FE parity** — MVP + recent-files reuse, regenerate, keyword/narrow, label picker + inline set creation, cross-session pending-job recovery. Larger; matches web exactly.
3. **Rewrite from scratch** — rejected: duplicates working code, no benefit.

## Agreed Direction (assumed defaults — user was away; confirm before build)
- **Entry point:** contextual "Tạo bằng AI" button inside the existing Flashcard (Tài liệu) and Đề thi screens — keeps 4 tabs, sits next to where results are viewed.
- **Scope:** MVP — upload → generate → poll → save into new/existing set.
- **Access:** all logged-in users, honoring backend page toggles. NOTE: app session **already carries `UserRole.{Student,Teacher,Admin}`**, so teacher-only gating (FE parity) is trivial if preferred — this is a product call, not an engineering one.
- **Both platforms** (Android + iOS) per CLAUDE.md parity mandate.

## What to Watch (implementation risks)
- **Stale contract:** orphaned `ai/*` client has sat unused — verify field names (`quantityQuizz` vs `quantityQuiz` normalization at gateway), `JobStatus` enum values (client uses PENDING/RUNNING/DONE/FAILED/CANCELLED; BE emits pending/processing/completed/failed), and `result` shape against current gateway before wiring.
- **Save seam** is the real net-new work — the save-history endpoints + set/label pickers must be added to the app (may partly exist in exams/study features).
- **iOS has no auto token-refresh** — long polling jobs (up to 60 min BE-side) may outlive a token; confirm 401 handling on iOS.
- **Page toggle** — if `ai-tool` is disabled, entry point should hide/handle 404 gracefully.
- Keep diffs per-platform; iOS is a fully independent Swift stack (no shared framework), so logic is implemented twice.

## Success Criteria
- From the app, a user uploads a PDF, generates quiz or flashcards, and saves them into a set that then appears in the existing study/exam screens — on both Android and iOS.
- No backend changes required.

## Next Steps
- Confirm the 3 assumed decisions (entry point / scope / access).
- If confirmed → `/tkm:create-plan` using this summary; first phase = **verify orphaned contract vs current gateway**, then wiring, then save seam.
