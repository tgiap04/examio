---
title: "Phase 10: Exams/ExamRoom Integration"
description: "Wire Exams UI + 2 new room screens to VMs; remove MyExamsModels + DeThiScreen mock"
status: pending
priority: P1
effort: 5h
track: Integration
---

# Phase 10: Exams/ExamRoom Integration

> BlockedBy Phase 08 (UI) + Phase 09 (logic).

## Context Links
- Phase 08 (UI + 2 missing screens), Phase 09 (VMs/repo)

## Overview
Connect my-exams, manage-exam (quizset mgmt), exam-room list, and exam-room detail to their ViewModels; replace mock; wire CRUD + nested detail navigation state.

## Requirements
- All four screens render real data on BOTH platforms.
- Room detail nested state (sessions + attempts) loads and persists CRUD.

## Related Code Files

### Modify
- Android: `MyExamsScreen.kt`, `DeThiScreen.kt`, `ExamRoomListScreen.kt`, `ExamRoomDetailScreen.kt` — inject VMs
- iOS: `MyExamsView.swift`, exam mgmt subview, `ExamRoomListView.swift`, `ExamRoomDetailView.swift`

### Delete (mock — exact)
- Android: `MyExamsModels.kt` mock block **L27-70**; `DeThiScreen.kt` mock **L86** and **L43**
- iOS: `MyExamsView.swift` mock block **L171-186**; `ContentView.swift` mock **L78-79** and **L211-215**

## Implementation Steps
1. Inject VMs into all four screens; collect state.
2. Wire room-detail state flag (selectedRoomId) → detail VM → sessions/attempts.
3. Wire quizset + room + session CRUD actions.
4. Remove listed mock blocks; delete unused mock symbols.
5. Build Android + iOS.

## Todo
- [ ] my-exams + manage-exam wired
- [ ] exam-room list + detail wired
- [ ] Android mock removed (MyExamsModels L27-70, DeThiScreen L86/L43)
- [ ] iOS mock removed (MyExamsView L171-186, ContentView L78-79/L211-215)
- [ ] Both builds green

## Success Criteria
- Exams tab + room list/detail show real data on both platforms; CRUD persists; zero mock remains in Exams.

## Risks
| Risk | Mitigation |
|------|-----------|
| ContentView.swift mock removal affects shared nav state | Confirm L78-79/L211-215 are exam-only mock before deleting |
