---
title: AI Flashcard/Quiz Generation — wire up in kmaedu-app (Android + iOS)
status: pending
work_type: feature
spec_waived: "Reuses existing kmaedu-be AI-generation contract (already implemented & shipped in kmaedu-fe); mobile scope is wire-up + contract-verify + save seam, no new backend behavior. Requirements captured in consultation-summary.md."
created: 2026-07-04
level: medium
blockedBy: []
blocks: []
---

# AI Flashcard/Quiz Generation — kmaedu-app

## Context
The AI generation feature is **already coded on both platforms but orphaned** (not wired to DI/nav; save seam missing). See `consultation-summary.md`. This plan wires it up, verifies the possibly-stale client contract, and finishes the generate→save→view loop. **No backend changes.**

## Design assumptions (from consultation — flip if wrong)
- **Entry point:** contextual "Tạo bằng AI" button inside Flashcard (Tài liệu) + Đề thi screens (keep 4 tabs).
- **Scope:** MVP — upload PDF → generate → poll → save into new/existing set → view.
- **Access:** all logged-in users; honor backend page toggles (`ai-tool`/`manage-exam`/`flash-card`). App session already has `UserRole` if teacher-gating is later preferred.
- **Parity:** Android + iOS both (iOS is independent Swift stack — logic implemented twice).

## Phases
| # | Phase | Status | Depends on |
|---|-------|--------|-----------|
| 01 | [Verify client contract vs gateway](phase-01-verify-contract.md) | ✅ done | — |
| 02 | [Shared layer: save-history + poller finalize](phase-02-shared-layer.md) | ✅ done | 01 |
| 03 | [Android: DI wiring + contextual entry](phase-03-android-wiring.md) | ✅ done | 02 |
| 04 | [Android: review → save-to-set → view seam](phase-04-android-save-seam.md) | ✅ done | 03 |
| 05 | [iOS: entry + wiring](phase-05-ios-wiring.md) | ✅ done (simulator build passes) | 02 |
| 06 | [iOS: review → save-to-set → view seam](phase-06-ios-save-seam.md) | ✅ done (simulator build passes) | 05 |
| 07 | [Integration, edge cases, tests](phase-07-integration-test.md) | 🟡 Android build + 4 contract unit tests + review; iOS simulator build passes; live-backend full-loop QA pending | 04, 06 |

## Session log (2026-07-04)
- **Contract drift confirmed & fixed (P01):** poller checked `DONE`, backend emits `completed` → feature could never terminate. Fixed status matching (case-insensitive lowercase), added inline `quizzes`/`flashcards` to `JobResult`, raised poll timeout 3→10 min.
- **P02–P04 Android:** save-history API/repo methods; DI wiring; contextual entry buttons (Tài liệu → flashcard, Đề thi → quiz); result preview + save to new/existing set.
- **Inspection fix:** save flow now keys off `result.type` (not the mutable UI toggle); type chip locks after generate; prior poll job cancelled on restart.
- **iOS (P05/P06):** same P01 bug fixed in Swift (`AIToolViewModel.swift`: lowercase status, added `JobResult` with inline quizzes/flashcards, timeout 3→10min); save seam in `AiView.swift` + VM (save keyed off `result.type`, type picker locks, generator section made scrollable); entry via `StudyView` button + repurposed `DeThiView` "Tạo đề bằng AI" → presents `AiView` sheet. Note: `DeThiView` is still a mock list screen; the AI button works regardless.
- **Verified:** `:androidApp:assembleDebug` + `:shared:testDebugUnitTest` (AiGenerationContractTest, 4 tests) pass; **iOS `xcodebuild -scheme KMAEduApp -sdk iphonesimulator` BUILD SUCCEEDED**.
- **Deferred follow-ups (non-blocking, from review):** distinguish serialization vs network errors in `ApiCall.kt` (amplified by 10-min timeout); retry/cleanup path for orphaned empty set on second-step save failure; pagination for >100 existing sets; live-backend full-loop/edge-case QA (P07); iOS has no auto token-refresh (long poll may 401).

**Track structure:** P01→P02 is shared foundation. Android (03→04) and iOS (05→06) run in parallel after P02 — no cross-track blocking. P07 integrates both.

## Follow-up (2026-07-04, later): removed "Giáo viên AI" chat
Per user request, stripped the AI-teacher chat AND upload-history sections — the AI screen is now a single-purpose generator (quiz/flashcard only), no tab picker. Removed dead code both platforms:
- Shared: deleted `AIChatApiService`, `SubjectApiService`, `AIChatModels`, `SubjectModels`, `SSEClient` (expect+2 actuals); slimmed `AIGeneratorApiService` (generate + job status only) + `AIGeneratorModels`; `AIChatRepository` → **`AIGeneratorRepository`** (generator-only).
- Android: `AIToolViewModel`/`AiScreen` generator-only; deleted `AiModels.kt` (AiSection/AiChatMessage); DI + `KMAEduApp` updated.
- iOS: `AIToolViewModel.swift`/`AiView.swift` generator-only; removed AiSection + chat/history models & UI; entry sheets updated.
- Verified: Android assembleDebug + shared tests pass; iOS simulator BUILD SUCCEEDED; zero dangling refs to removed classes.

## Follow-up (2026-07-04, later): removed "từ khóa" (keyword) input
Per user, removed the keyword field from generation on both platforms. `generateFromFile` no longer takes `keyword`/`isNarrowSearch` (API service now hardcodes `isNarrowSearch=false`); dropped keyword state/UI in Android VM+AiScreen and iOS VM+AiView. Verified: Android compile + shared tests pass; iOS simulator BUILD SUCCEEDED; no lingering `keyword` refs.

## Bugfix (2026-07-04): file picker strands user on system screen (Android)
Root cause: `aiGenerateType` (AI overlay gate in `KMAEduApp.kt`) used plain `remember` → when the system file picker foregrounds and Android recreates MainActivity (guaranteed with "Don't keep activities"), the overlay reset to null on return and the picker result (registered inside the now-uncomposed AiScreen) was dropped. Fix: `rememberSaveable` for `aiGenerateType` so the overlay + launcher survive recreation and the pending file result is redelivered. Verified: assembleDebug passes. (Note: could not repro headlessly — logcat needed if it persists; likely a stale-Activity-context crash-on-recreate would be the next suspect.)

## Bugfix (2026-07-05): token refresh never worked → "Invalid or expired token" ~15m after login
Root cause (proven from Ktor 2.3.12 source): Android `AuthInterceptor` drove the 401 refresh from a
`try/catch (ClientRequestException)` around `execute(request)`, but that catch is **dead code**.
`expectSuccess=true` installs `HttpCallValidator`, which registers its own OUTER `HttpSend` interceptor
(`HttpSend` wraps interceptors last-registered-inward; the validator registered at client-build is outer,
`AuthInterceptor.installOn` runs after so it's inner). The validator's `validateResponse()` throws the 401
AFTER our inner `execute()` returns — so `execute()` never throws here and the refresh never ran; the raw
401 surfaced (BE `auth.guard.ts` message). Access token TTL = `ACCESS_TOKEN_EXPIRATION || '15m'`; BE login
returns `refreshToken` in JSON body and `POST /auth/refresh` accepts it from body → contract was fine.
- **Android fix:** inspect `execute(request).response.status` directly (canonical Ktor pattern), refresh +
  retry once on 401, return the 401 call unretried when refresh fails (outer validator surfaces it).
- **iOS fix:** `KMAEduAPIClient` had NO refresh at all — added single-flight `TokenRefresher` actor +
  401→refresh→retry-once in `perform` and `delete`; shared `SessionKeychain` read/write.
- Verified: `:androidApp:assembleDebug` OK; iOS `xcodebuild -sdk iphonesimulator` BUILD SUCCEEDED. Resolves
  the earlier "iOS lacks auto token-refresh" deferred risk.

## Key constraints (backend contract, reuse as-is)
- `POST /ai/generate-from-file` (multipart PDF, `typeResult` 1=quiz/2=flashcard, `quantityQuizz|quantityFlashcard` ≤50, `isNarrowSearch`, `keyword`) → `{jobId}`.
- Poll `GET /ai/job/{jobId}` → `completed` → `result.{quizzes|flashcards}` + `historyId`.
- Save: `POST /quizsets/save-history-to-quizset` / `/flashcardsets/save-history-to-flashcardset` `{setIds[], historyId, labelId|labelName+labelColor}`.
- PDF only, ≤5MB, ≤50 pages, single-answer MCQ, no streaming (poll), `FREE_MODE=true` (credits bypassed). Auth: `Authorization: Bearer` + `X-Device-ID`.

## Success criteria
User uploads a PDF in-app, generates quiz or flashcards, saves them into a set that appears in existing study/exam screens — on **both** Android and iOS. No backend change.

## Risks
- Stale orphaned contract (enum/field drift) — P01 gates everything.
- iOS lacks auto token-refresh; long jobs may 401 mid-poll.
- Page toggle disabled → entry must hide/handle 404.
