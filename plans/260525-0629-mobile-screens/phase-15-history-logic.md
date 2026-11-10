---
title: "Phase 15: History Repo + ViewModel Wiring (Track B)"
description: "HistoryRepository (added Phase 01) + HistoryViewModel: history-stats, examattempts list, ai recent-uploads (pdf)"
status: pending
priority: P1
effort: 4h
track: B
---

# Phase 15: History Repo + ViewModel Wiring (Track B)

> BlockedBy Phase 01 only (needs HistoryRepository from Phase 01). Parallel-runnable with Phase 14. NO A↔B block.

## Context Links
- DTO source: `../../examio-fe/src/apis/historyApi.ts`
- Shared: `HistoryApiService.kt`, `HistoryRepository.kt` (added Phase 01), `AIGeneratorApiService.kt` (recent-uploads for pdf tab)

## Overview
Build the History ViewModel over the new `HistoryRepository`. PDF tab reuses ai recent-uploads.

## Requirements

### Endpoints
- GET /examattempts/history-stats (dashboard)
- GET /examattempts/list (exam history)
- GET /ai/recent-uploads (pdf history)

### DTOs to verify (cite before coding)
- `historyApi`: **HistoryStats, ExamHistoryItem, PDFHistoryItem**

### Behavior
- Three independent loads (stats, exam list, pdf list); pagination on lists; per-section loading/error/empty.

## Related Code Files

### Create
- Android: `androidApp/.../features/history/HistoryViewModel.kt`
- iOS: `iosApp/ExamioApp/ViewModels/HistoryViewModel.swift`

### Modify
- `shared/.../features/history/repository/HistoryRepository.kt` (ensure stats/list fns; add pdf via ai recent-uploads passthrough)
- DTO patch in `HistoryApiService.kt` on drift

## Implementation Steps
1. Verify HistoryStats/ExamHistoryItem/PDFHistoryItem vs historyApi.
2. Ensure HistoryRepository exposes stats, examList (paginated), pdfList (ai recent-uploads).
3. Build HistoryViewModel per platform with three section states.
4. Unit-test section state transitions + pagination.

## Todo
- [ ] DTOs verified (HistoryStats, ExamHistoryItem, PDFHistoryItem)
- [ ] HistoryRepository fns confirmed/added
- [ ] HistoryViewModel Android
- [ ] HistoryViewModel iOS
- [ ] Section states tested

## Success Criteria
- VM loads real stats + exam history + pdf history via repo.

## Risks
| Risk | Mitigation |
|------|-----------|
| pdf tab DTO differs from ai recent-uploads | Map ai upload item → PDFHistoryItem explicitly |
