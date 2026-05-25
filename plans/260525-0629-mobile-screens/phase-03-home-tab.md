---
title: "Phase 3: Home Tab"
description: "Dashboard with stats summary and recent activity for the Home tab"
status: pending
priority: P2
effort: 8h
---

# Phase 3: Home Tab

## Context

- [Frontend stats store](../../examio-fe/src/stores/useStatsStore.ts)
- [History API](../../examio-fe/src/apis/historyApi.ts)
- [Student materials API](../../examio-fe/src/apis/studentMaterialsApi.ts)
- Depends on: Phase 1 (shared), Phase 2 (auth)

## Overview

Home tab shows a dashboard summary: learning stats (total PDFs, exams created, flashcard sets, study hours), recent flashcard sets accessed, and recent exam attempts. Acts as a quick-access hub.

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /examattempts/history-stats` | Aggregated stats |
| `GET /student/recent-flashcards?limit=5` | Recent flashcard sets |
| `GET /student/recent-exams?limit=5` | Recent exam attempts |

## Files to Create

### iOS (`iosApp/ExamioApp/Features/Home/`)

| File | Purpose |
|------|---------|
| `HomeView.swift` | Main home tab view (replaces placeholder) |
| `HomeViewModel.swift` | Loads stats + recent items |
| `StatsCardView.swift` | Reusable stat card (icon + number + label) |
| `RecentFlashcardRow.swift` | Row item for recent flashcard set |
| `RecentExamRow.swift` | Row item for recent exam attempt |

### Android (`androidApp/src/main/kotlin/com/examio/app/features/home/`)

| File | Purpose |
|------|---------|
| `HomeScreen.kt` | Main home tab (replaces placeholder) |
| `HomeViewModel.kt` | Loads stats + recent items |
| `StatsCard.kt` | Reusable stat card composable |
| `RecentFlashcardItem.kt` | List item for recent flashcard set |
| `RecentExamItem.kt` | List item for recent exam attempt |

### Files to Modify

| File | Change |
|------|--------|
| `iosApp/ExamioApp/Views/HomeView.swift` | Replace placeholder with new HomeView |
| `androidApp/.../features/home/HomeScreen.kt` | Replace placeholder with real implementation |

## Implementation Steps

1. Create `HomeViewModel` consuming `HistoryRepository` + `StudentMaterialsRepository`
2. On appear/launch: fetch stats, recent flashcards (limit 5), recent exams (limit 5) in parallel
3. Build stats grid (4 cards: PDFs, exams, flashcard sets, study hours)
4. Build "Recent Flashcards" section with horizontal scroll or vertical list
5. Build "Recent Exams" section with vertical list
6. Tapping a flashcard set navigates to study screen; tapping exam navigates to exam detail
7. Pull-to-refresh reloads all data
8. Handle loading/empty/error states via `LoadableState`

## Data Flow

```
HomeView -> HomeViewModel.loadDashboard()
  -> parallel:
     HistoryRepository.getStats() -> HistoryStats
     StudentMaterialsRepository.getRecentFlashcards(5) -> [RecentFlashcardSet]
     StudentMaterialsRepository.getRecentExams(5) -> [RecentExamAttempt]
  -> UI renders stats cards + recent lists
```

## Success Criteria

- [ ] Stats cards display correct numbers from API
- [ ] Recent flashcard sets show title, thumbnail, card count
- [ ] Recent exams show title, score, date
- [ ] Pull-to-refresh works
- [ ] Empty state shown when no recent activity
- [ ] Loading skeleton shown during fetch
- [ ] Tapping items navigates to detail screens

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Stats API slow on first load | Show skeleton; cache result for session |
| No recent activity for new users | Design empty state with CTA to explore |

## Rollback

Revert HomeView/HomeScreen to placeholder. No other files affected.
