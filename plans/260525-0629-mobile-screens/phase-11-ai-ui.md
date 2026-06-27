---
title: "Phase 11: AI Tool UI (Track A)"
description: "Native-mobile UI for ai-tool: file pick, generation progress, recent uploads, generated questions"
status: pending
priority: P1
effort: 5h
track: A
---

# Phase 11: AI Tool UI (Track A)

> Parallel-runnable with Phase 12 (Track B). NO A↔B block. Presentational only.

## Screen refs (/k)
- ai-tool (generate-from-file flow)

## Goal
Native-mobile UI for the AI tool: file picker entry, generation-in-progress indicator (job running), recent uploads list, and generated-questions display. AIToolScreen.kt is the LIVE tab (AiScreen.kt is dead code — ignore, deleted in Phase 17). Use design content as placeholder props.

## Files to modify
- Android: `androidApp/.../features/ai/AIToolScreen.kt` (split: `AiUploadSection.kt`, `AiRecentUploadsSection.kt`, `AiGeneratedQuestionsSection.kt` if >200 lines)
- iOS: `iosApp/ExamioApp/Views/AiView.swift` (split subviews)

## Out of scope
- Job-polling logic, API calls, multipart (Phase 12/13). AI Teacher SSE chat (deferred). AiScreen.kt (dead — Phase 17 deletes).

## Integration contract (props)
- generate: file-pick callback, generating flag + progress, onCancel
- recent uploads: list (name, date, status), open/delete/regenerate callbacks
- generated questions: questions list (from completed job)

## Todo
- [ ] Android ai-tool UI: upload + progress + recent + questions
- [ ] iOS parity
- [ ] Files < 200 lines each
