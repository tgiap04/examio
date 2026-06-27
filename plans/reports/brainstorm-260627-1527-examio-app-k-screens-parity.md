# Consultation — Examio App: implement /k screens parity (Android + iOS)

Date: 2026-06-27 · Lens: CTO · Outcome: design sealed, ready for blueprint

## Commission

Bring the `examio-fe` mobile-web `/k` route surface to the KMP mobile app (`examio-app`),
both Android (Compose) + iOS (SwiftUI), as **native-mobile** UI, wired to the **shared
existing backend** (`examio-be` gateway) via the shared KMP repository/api layer.

## Workshop facts (current state)

- **`/k` routes:** 21 screens — Account(profile/verify/subscription), Study(my-materials,
  flash-card, manage-quiz-set/:id, manage-flashcard-set/:id), Exams(my-exams, manage-exam,
  manage-exam-room[+/:id, +/session/:sessionId]), AI(ai-tool), History(history/exam/pdf),
  WordFamily(3).
- **App shared layer (commonMain):** api+repository already exist for auth, study
  (flashcard/materials), exams (quizset/room/attempt), ai (chat/subject/generator),
  history, account (profile/wallet). Networking (`ApiCall`, `ApiEndpoints`, `ApiResult`) in place.
- **Android UI:** 5 bottom tabs (AiTool, TaiLieu/Study, BaiThi/MyExams, DeThi, LichSu/History);
  auth complete. iOS UI mirrors tabs but several screens are `PlaceholderScreen`.
- **Existing mock data:** `AIToolScreen.kt` (sampleQuestions), `AiScreen.kt`,
  `MyExamsModels.kt` (mock-entrance/mock-review).
- **App nav model is tab-based, NOT a 1:1 of the 21 `/k` routes.**

## Sealed decisions

- Scope intent: all 21 `/k` screens — BUT screens lacking shared API are **deferred** (see below).
- Platforms: **both Android + iOS** (per CLAUDE.md mobile rule).
- UI fidelity: **native mobile** (user-stories.md: do not cram desktop into mobile).
- Data: **real BE wiring** via shared repository/api; no mock in final.
- Decompose: **5 feature-group plans, sequential**: Account → Study/Materials →
  Exams/ExamRoom → AI → History (+WordFamily).
- Missing-API screens: **deferred this round** — word-family(3), subscription, verify,
  exam-room session analytics (no shared endpoint yet). Do NOT add new shared API now.
- Existing mock: **replace all with real API** during the relevant feature plan.

## In-scope vs deferred (by shared API coverage)

IN SCOPE (shared endpoint exists): profile, my-materials, flash-card, manage-quiz-set/:id,
manage-flashcard-set/:id, my-exams, manage-exam, manage-exam-room(+detail), ai-tool,
history/exam/pdf. Plus: refactor AIToolScreen/AiScreen/MyExams off mock.

DEFERRED (no shared API this round): /k/verify, /k/subscription, /k/word-family(*),
/k/manage-exam-room/:id/session/:sessionId (analytics/cheating-log).

## Two-track shape (MoMorph rule — parallel-runnable)

Each feature-group plan must keep Track A (UI per screen, Android+iOS) and Track B
(shared api/repository + behavior logic) independent — no blocks/blockedBy across tracks;
integration in a dedicated late phase. `tkm:create-plan` builds the phase graph; no UI
subagents spawned at plan time.

## What to watch

- iOS trails Android — placeholders must become real, reusing shared logic.
- Per-platform parity: every UI change lands in BOTH androidApp and iosApp.
- BE response shape drives shared model classes — verify against FE api clients
  (authApi/examApi/etc.) before coding.
- Keep each Kotlin/Swift file < 200 lines; split by component.

## Success criteria

- Each in-scope `/k` screen has a native Android + iOS equivalent reachable via app nav.
- Screens call real gateway BE through shared repository; zero mock in final code.
- Builds green (Android + iOS); behavior parity with web /k.

## Open questions

- Exact app navigation placement for non-tab screens (set-detail, manage-exam-room detail):
  push/stack vs sheet — to resolve per-plan during create-plan.
