# Phase 01 — Grouping Logic + Types

**Priority:** P1 · **Status:** completed · Blocks: 02, 03, 04

## Goal
Pure data layer: derive per-session summaries from `RecentExamAttempt[]`.

## File
`src/pages/k/MyExamsPage.tsx` (add types + pure fns near top).

## Add type

```ts
interface SessionSummary {
  examSessionId: string
  examRoomId: string
  title: string
  description: string | null
  showAnswersAfterSubmit: boolean
  attemptCount: number
  bestScore: number | null      // max score across completed attempts
  bestPercentage: number        // best correct/total %
  lastAttemptAt: string         // max startedAt
  hasInProgress: boolean        // any attempt status === 0
  inProgressSessionId: string | null  // === examSessionId when hasInProgress
  totalViolations: number       // sum violationCount
  isPinned: boolean             // from any attempt of the room
}
```

## Add pure fn `groupBySession`

Steps:
1. `Map<examSessionId, RecentExamAttempt[]>` — preserve insertion order.
2. Per group derive:
   - `bestScore = max(score)` over attempts where `status === 1` && `score != null`; else null.
   - `bestPercentage = max(round(correctAnswers/totalQuestions*100))` over completed (totalQuestions>0); else 0.
   - `lastAttemptAt = max(startedAt)`.
   - `hasInProgress = some(status === 0)`.
   - `attemptCount = group.length`.
   - `totalViolations = sum(violationCount)`.
   - `isPinned` / `title` / `description` / `showAnswersAfterSubmit` / `examRoomId` from first attempt (`examSession.examRoom`).
3. Return `SessionSummary[]`.

## Update `sortWithPinnedFirst`
Change signature to operate on `SessionSummary[]` (pinned first, keep relative order).

## Edge cases
- All attempts in-progress → bestScore null, bestPercentage 0, badge "Đang làm".
- `score` typed `number` in RecentExamAttempt but can be 0 — treat 0 as valid, only null/absent as "no score".
- Empty input → `[]`.

## Todo
- [x] Add `SessionSummary` interface
- [x] Implement `groupBySession(attempts): SessionSummary[]`
- [x] Retype `sortWithPinnedFirst` to `SessionSummary[]`

## Success Criteria
- Pure, no side effects. Same `examSessionId` collapses to one summary.
- `bestScore`/`bestPercentage`/`lastAttemptAt` correct for mixed-status groups.
