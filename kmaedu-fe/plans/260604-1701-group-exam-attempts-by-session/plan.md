---
title: "Group /k/my-exams attempts by exam session"
description: "One card per exam session with a per-session attempt-history modal"
status: completed
priority: P2
effort: 3h
branch: main
tags: [frontend, react, my-exams, refactor]
created: 2026-06-04
completed: 2026-06-04
---

# Group Exam Attempts by Session (/k/my-exams)

Frontend-only refactor. Replace one-card-per-attempt with one-card-per-session.
Click "Lịch sử" → modal lazy-loads all attempts for that session via existing API.

No API or store changes. Existing endpoints cover all needs.

## Data Flow

```
fetchExams(page, PAGE_SIZE=50)            [studentMaterialsStore — cached]
  → RecentExamAttempt[]                   (raw attempts, current page)
  → groupBySession()                       (pure fn, in-page)
  → SessionSummary[]                       (1 per examSessionId)
  → sortWithPinnedFirst()
  → SessionCard[]  (grid)

Click "Lịch sử" on a card:
  → setHistoryDialog({ open, session })
  → getMyAttemptsBySessionApi(sessionId, 1, 50)   [examAttemptApi — lazy, not cached]
  → MyAttemptItem[]
  → AttemptHistoryList (modal body)

Click "Tiếp tục" (in-progress): navigate /exam-session/:id/quiz
Click "Xem kết quả" (completed): navigate /exam-session/:id/quiz?attemptId=...&view=result
```

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Grouping logic + types | completed | [phase-01](phase-01-grouping-logic.md) |
| 2 | SessionCard component | completed | [phase-02](phase-02-session-card.md) |
| 3 | Attempt-history modal | completed | [phase-03](phase-03-history-modal.md) |
| 4 | Wire MyExamsPage + cleanup | completed | [phase-04](phase-04-wire-page.md) |

Phases 2 and 3 depend on 1. Phase 4 depends on 2 and 3.
All work in a single file (`MyExamsPage.tsx`) → sequential, no parallel tracks.

## Key Decisions

- **Pagination**: switch `PAGE_SIZE` 12 → 50 raw attempts/page. Grouping done on
  current-page data only (acceptable per task). Card count = unique sessions on page.
  Display total cards as `sessions.length` from current page, keep API `total` only
  for the page nav (kept as-is; known minor gap, documented in Risks).
- **Pin**: stays per `examRoom.id` (unchanged semantics). Toggle updates all raw
  attempts of that room → re-group → SessionCard reflects pin.
- **Result view URL**: `/exam-session/:id/quiz?attemptId=<id>&view=result`
  (confirmed pattern in ExamSessionPage.tsx:357). Gate "Xem kết quả" on
  `status === 1` AND `examSession.showAnswersAfterSubmit === true`; otherwise hide
  result button (only completed status badge shown).
- **No new files**: keep everything in MyExamsPage.tsx, extract sub-components
  inline. If file exceeds ~260 lines, extract SessionCard + modal into
  `src/pages/k/components/` (sibling). Decide at phase 4.

## Out of Scope

- Backend changes, new API endpoints, store changes.
- Cross-page caching of per-session attempt lists (lazy fetch each open is fine — KISS).
- Server-side grouping/pagination correction.

## Success Criteria

- `/k/my-exams` shows exactly one card per unique `examSessionId` on the page.
- Card shows: room title, best score, attempt count, last-attempt time, "Đang làm"
  badge if any attempt status=0.
- "Tiếp tục" appears only when an in-progress attempt exists → navigates to quiz.
- "Lịch sử" always present → opens modal listing all attempts for that session.
- Modal items show attempt #, date, score%, correct/total, time spent, status badge;
  "Xem kết quả" only for eligible completed attempts.
- Pin toggle works at room level; `yarn lint` and `yarn build` pass; strict TS.

## Risks

| Risk | L×I | Mitigation |
|------|-----|------------|
| Grouping per-page splits one session across page boundaries | M×L | PAGE_SIZE=50 minimizes; documented; full fix needs BE grouping (out of scope) |
| `total`/page-nav mismatch vs visible card count | M×L | Keep nav on raw `total`; acceptable gap per task spec |
| Modal fetch fails | L×M | try/catch → toast + empty state in modal |
| `showAnswersAfterSubmit` false → no result view | — | Expected; hide button, no broken nav |
| File grows >200 lines | H×L | Extract sub-components to components/ dir in phase 4 |

## Rollback

Single-file change. Revert `MyExamsPage.tsx` to restore prior behavior.
No data migration, no shared-state changes — zero cascade risk.
