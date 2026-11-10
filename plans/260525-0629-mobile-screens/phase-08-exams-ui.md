---
title: "Phase 08: Exams/ExamRoom UI (Track A)"
description: "Native-mobile UI: my-exams, manage-exam (quizset mgmt), + 2 MISSING screens (exam-room list, exam-room detail)"
status: pending
priority: P1
effort: 10h
track: A
---

# Phase 08: Exams/ExamRoom UI (Track A)

> Parallel-runnable with Phase 09 (Track B). NO A↔B block. Presentational only.

## Screen refs (/k)
- my-exams, manage-exam (= QuizSet list management; currently only read-only DeThiScreen dashboard), **manage-exam-room list (MISSING)**, **manage-exam-room detail (MISSING)**

## Goal
Native-mobile UI for: my-exams list, manage-exam as an editable QuizSet management screen (DeThiScreen today is read-only — extend to management list), and the two missing exam-room screens (list + detail). Keep state-based nav: exam-room detail renders via `selectedRoomId` flag within the tab.

## Files to modify
- Android: `androidApp/.../features/exams/MyExamsScreen.kt`, `DeThiScreen.kt` (extend to quizset management; split if >200 lines)
- iOS: `iosApp/KMAEduApp/Views/MyExamsView.swift`, exam management subview

## Files to create (MISSING screens)
- Android: `androidApp/.../features/exams/ExamRoomListScreen.kt`, `ExamRoomDetailScreen.kt`
- iOS: `iosApp/KMAEduApp/Views/ExamRoomListView.swift`, `ExamRoomDetailView.swift`

## Out of scope
- API/VM/CRUD logic (Phase 09/10). Exam-room session analytics / cheating-log (deferred). Exam-taking secure flow (not in this round's scope).

## Integration contract (props)
- my-exams: recent exam attempts list
- manage-exam: quiz sets (title, stats), create/edit/delete callbacks
- exam-room list: rooms (name, status, counts), CRUD callbacks, open-detail callback
- exam-room detail: room header + sessions list + session CRUD callbacks + attempts list (read)

## Risk note (state-based nav)
exam-room list + detail are NEW (no existing file). Detail via state flag + back handler. If nested detail (room→sessions) exceeds state-flag capacity, escalate to a minimal nav stack scoped to the Exams tab only (flagged in plan risk table).

## Todo
- [ ] Android: my-exams + manage-exam (mgmt) + room list + room detail
- [ ] iOS: same parity
- [ ] Files < 200 lines each
