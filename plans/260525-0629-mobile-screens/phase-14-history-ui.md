---
title: "Phase 14: History UI (Track A)"
description: "Native-mobile UI for history dashboard, exam history, pdf history; both platforms"
status: pending
priority: P1
effort: 4h
track: A
---

# Phase 14: History UI (Track A)

> Parallel-runnable with Phase 15 (Track B). NO A↔B block. Presentational only.

## Screen refs (/k)
- history (dashboard), history/exam, history/pdf

## Goal
Native-mobile UI for the History tab: stats dashboard, exam-attempt history list, and PDF (recent-uploads) history list. Keep state-based nav (sub-tabs/segmented within History tab). Use design content as placeholder props.

## Files to modify
- Android: `androidApp/.../features/history/LichSuScreen.kt` (split: `HistoryStatsSection.kt`, `ExamHistorySection.kt`, `PdfHistorySection.kt` if >200 lines)
- iOS: history view (currently rendered via `ContentView.swift` / HomeView mock — add dedicated `HistoryView.swift` + subviews)

## Out of scope
- API/VM logic (Phase 15/16).

## Integration contract (props)
- dashboard: HistoryStats (counts/averages)
- exam history: list of ExamHistoryItem
- pdf history: list of PDFHistoryItem

## Todo
- [ ] Android history dashboard + exam + pdf sections
- [ ] iOS parity (HistoryView + subviews)
- [ ] Files < 200 lines each
