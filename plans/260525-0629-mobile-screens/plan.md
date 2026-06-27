---
title: "Examio App /k Parity — Wire Existing UI to Real API"
description: "Wire existing mock-data mobile screens (Android+iOS) to the shared API/repo layer + build 4 missing screens, for /k feature parity"
status: pending
priority: P1
effort: 92h
branch: feat/mobile-screens
work_type: feature
spec_waived: true
tags: [mobile, kmp, ios, android, swiftui, compose, wire-to-api]
created: 2026-05-25
---

# Examio App /k Parity

> **Supersedes the build-from-scratch framing.** Scout ground-truth: EVERY app screen already has UI on BOTH platforms but ALL render HARDCODED MOCK data, and NONE are wired to the shared API/repo layer. Dominant work is **WIRE existing UI → real API + add ViewModels**, NOT build-from-scratch. Only 4 screens are genuinely missing.
> `spec_waived`: UI parity of existing FE `/k` screens; contracts already defined by FE api clients — no new spec needed.

## Overview

Bring `examio-fe` `/k` route surface to `examio-app` (KMP: shared commonMain + androidApp Compose + iosApp SwiftUI) as **native-mobile** UI, wired to the **existing shared backend** via the shared repository/api layer. Two kinds of work: (1) replace mock with real repo calls + ViewModels across existing screens; (2) build 4 missing screens (manage-quiz-set detail, manage-flashcard-set detail, manage-exam-room list, manage-exam-room detail).

Shared layer ALREADY has api+repository for auth, profile+wallet (AccountRepository), flashcard+studentMaterials (FlashcardRepository), quizset+examroom+examattempt (ExamRepository), ai chat+generator+subject (AIChatRepository). `HistoryApiService` exists but has NO repository — ADD `HistoryRepository`.

Navigation is **STATE-BASED** (no NavHost / no NavigationStack); detail screens render via state flags within a tab. Keep this pattern; do NOT add a nav library unless a phase needs it (flagged as risk for missing detail screens).

## Two-track shape (MoMorph)

Per feature group: Track A (UI per screen, BOTH platforms) and Track B (shared api/repo + ViewModel/behavior logic) are **parallel-runnable — NO blocks between A and B of the same group**. Mock→real wiring lands in a dedicated Integration phase at the END of each group. Phase 01 is the only true prerequisite (blocks Track B wiring phases, NOT Track A polish phases).

## Phases

| # | Phase | Track | Effort | Status | BlockedBy |
|---|-------|-------|--------|--------|-----------|
| 01 | [Shared foundation refresh](./phase-01-shared-foundation-refresh.md) | Prereq | 8h | Pending | — |
| 02 | [Account UI](./phase-02-account-ui.md) | A | 6h | Pending | — |
| 03 | [Account repo+VM wiring](./phase-03-account-logic.md) | B | 6h | Pending | 01 |
| 04 | [Account integration](./phase-04-account-integration.md) | Integration | 3h | Pending | 02,03 |
| 05 | [Study/Materials UI](./phase-05-study-ui.md) | A | 10h | Pending | — |
| 06 | [Study/Materials repo+VM wiring](./phase-06-study-logic.md) | B | 10h | Pending | 01 |
| 07 | [Study/Materials integration](./phase-07-study-integration.md) | Integration | 5h | Pending | 05,06 |
| 08 | [Exams/ExamRoom UI](./phase-08-exams-ui.md) | A | 10h | Pending | — |
| 09 | [Exams/ExamRoom repo+VM wiring](./phase-09-exams-logic.md) | B | 10h | Pending | 01 |
| 10 | [Exams/ExamRoom integration](./phase-10-exams-integration.md) | Integration | 5h | Pending | 08,09 |
| 11 | [AI tool UI](./phase-11-ai-ui.md) | A | 5h | Pending | — |
| 12 | [AI tool repo+VM (job polling)](./phase-12-ai-logic.md) | B | 6h | Pending | 01 |
| 13 | [AI tool integration](./phase-13-ai-integration.md) | Integration | 3h | Pending | 11,12 |
| 14 | [History UI](./phase-14-history-ui.md) | A | 4h | Pending | — |
| 15 | [History repo+VM wiring](./phase-15-history-logic.md) | B | 4h | Pending | 01 |
| 16 | [History integration](./phase-16-history-integration.md) | Integration | 3h | Pending | 14,15 |
| 17 | [Cross-cutting cleanup](./phase-17-cleanup.md) | Cleanup | 4h | Pending | 04,07,10,13,16 |

Group order is sequential (Account → Study → Exams → AI → History). Within a group, A and B run in parallel; integration follows both.

## IN SCOPE (shared endpoint exists)

- **Account:** profile (GET/PUT /profile, multipart avatar/banner), wallet (GET /wallet/details)
- **Study:** my-materials (recent-flashcards/exams + pin), flash-card list (flashcardsets + stats + CRUD thumbnail multipart), manage-quiz-set/:id (questions CRUD + labels) **[MISSING]**, manage-flashcard-set/:id (flashcards CRUD + labels) **[MISSING]**
- **Exams:** my-exams (recent-exams), manage-exam = quizset management (quizsets + stats + CRUD), manage-exam-room list **[MISSING]**, manage-exam-room detail **[MISSING]**
- **AI:** ai-tool (generate-from-file multipart → job polling, recent-uploads, upload/{id} GET/DELETE, regenerate/{id})
- **History:** dashboard (history-stats), exam (examattempts list), pdf (ai recent-uploads)

## DEFERRED (do NOT implement)

`/k/verify`, `/k/subscription`, `/k/word-family*`, `/k/manage-exam-room/:id/session/:sessionId` (analytics/cheating-log). No new shared API beyond what in-scope screens need. AI Teacher SSE chat OUT OF SCOPE this round.

## Key Decisions (sealed)

- Wire existing UI to real API; do NOT rebuild. Only 4 missing screens built fresh.
- Keep state-based navigation; no nav library unless a missing detail screen forces it.
- Every UI change lands in BOTH androidApp AND iosApp; native-mobile layout (per user-stories.md), NOT desktop /k layout.
- Verify model field shapes against FE api clients before coding (DTOs cited per phase).
- AI generation is ASYNC JOB POLLING (POST → {jobId} → poll GET /ai/job/{jobId}), NOT SSE.
- Add `HistoryRepository` wrapping existing `HistoryApiService`.
- Each Kotlin/Swift file < 200 lines; split by component.
- Zero mock in final code.

## Risk Summary

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| State-based nav can't host 4 missing detail screens cleanly | Medium | High | Add detail-state flag + back-handler per tab; if insufficient, scope a minimal nav stack in phase 08/05 only — flagged in those phases |
| Multipart upload in KMP (avatar/banner/thumbnail/ai-file) | Medium | High | Single shared Ktor multipart helper in phase 01; platform file-picker via expect/actual |
| AI job polling (lifecycle, cancel, backoff) | Medium | Medium | Shared polling helper with timeout+backoff in phase 01; cancel on screen-leave |
| iOS lags Android (some placeholders) | High | Medium | Every phase lists explicit iosApp files; integration phase gates on BOTH platforms |
| Files exceed 200 lines when wiring | Medium | Low | Split ViewModels / sub-composables / subviews per component |

## Success Criteria

- Each in-scope `/k` screen has native Android + iOS equivalent reachable via app nav.
- Screens call real gateway BE via shared repository; ZERO mock in final code (all listed mock files removed, AiScreen.kt deleted).
- 4 missing screens built on BOTH platforms.
- Builds green (Android + iOS); behavior parity with web /k.
