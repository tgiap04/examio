---
title: "Phase 07: Study/Materials Integration"
description: "Wire Study UI + 2 new detail screens to VMs; remove StudyModels mock"
status: pending
priority: P1
effort: 5h
track: Integration
---

# Phase 07: Study/Materials Integration

> BlockedBy Phase 05 (UI) + Phase 06 (logic).

## Context Links
- Phase 05 (UI + 2 missing screens), Phase 06 (VMs/repo)

## Overview
Connect my-materials, flashcard list, and the two new detail screens to their ViewModels; replace mock; wire CRUD, pin toggle, thumbnail picker→upload, detail navigation state.

## Requirements
- All four Study screens render real data on BOTH platforms.
- Detail screens reachable via state flag; CRUD + labels persist via repo.
- Thumbnail pick→upload→refresh works.

## Related Code Files

### Modify
- Android: `StudyScreen.kt`, `QuizSetDetailScreen.kt`, `FlashcardSetDetailScreen.kt` — inject VMs
- iOS: `StudyView.swift`, `QuizSetDetailView.swift`, `FlashcardSetDetailView.swift` — observe VMs

### Delete (mock — exact)
- Android: `StudyModels.kt` mock block **L18-50**
- iOS: `StudyView.swift` mock block **L103-126**

## Implementation Steps
1. Inject list VMs into StudyScreen/StudyView; collect paginated state.
2. Wire detail-state flag (selectedSetId) → detail VM load → detail screen.
3. Wire CRUD actions, pin toggle, thumbnail picker→upload.
4. Remove listed mock blocks; delete unused mock symbols.
5. Build Android + iOS.

## Todo
- [ ] my-materials wired (both platforms)
- [ ] flashcard list wired + thumbnail upload
- [ ] quiz-set detail + flashcard-set detail wired
- [ ] Android mock L18-50 removed; iOS mock L103-126 removed
- [ ] Both builds green

## Success Criteria
- Study tab + both detail screens show real data on both platforms; CRUD/labels/pin persist; zero mock remains in Study.

## Risks
| Risk | Mitigation |
|------|-----------|
| Detail-state back handling loses list scroll | Preserve list state when entering/leaving detail |
