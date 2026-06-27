---
title: "Phase 13: AI Tool Integration"
description: "Wire AI tool UI to AiToolViewModel job-polling flow; remove AiModels + AIToolScreen sampleQuestions mock"
status: pending
priority: P1
effort: 3h
track: Integration
---

# Phase 13: AI Tool Integration

> BlockedBy Phase 11 (UI) + Phase 12 (logic).

## Context Links
- Phase 11 (UI), Phase 12 (VM/job polling)

## Overview
Connect AIToolScreen / AiView to AiToolViewModel; replace sampleQuestions + AiModels mock with the real generate→poll→render flow; wire file picker, progress, recent uploads, delete, regenerate.

## Requirements
- File pick → multipart upload → polling progress → generated questions render, BOTH platforms.
- Recent uploads list + delete + regenerate from real API.

## Related Code Files

### Modify
- Android: `AIToolScreen.kt` — inject AiToolViewModel, collect state
- iOS: `AiView.swift` — observe AiToolViewModel

### Delete (mock — exact)
- Android: `AiModels.kt` mock block **L20-34**; `AIToolScreen.kt` sampleQuestions **L122-126**
- iOS: `AiView.swift` mock block **L129-143**

## Implementation Steps
1. Inject AiToolViewModel; collect job + recent-uploads state.
2. Wire file picker → VM.generateFromFile; show running progress; render questions on DONE.
3. Wire recent uploads list + delete + regenerate.
4. Remove listed mock blocks; delete unused symbols.
5. Build Android + iOS.

## Todo
- [ ] Generate→poll→render wired (both platforms)
- [ ] Recent uploads + delete + regenerate wired
- [ ] Android mock removed (AiModels L20-34, AIToolScreen L122-126)
- [ ] iOS mock removed (AiView L129-143)
- [ ] Both builds green

## Success Criteria
- AI tab runs real generate-from-file job flow on both platforms; zero mock remains in AI tool.

## Risks
| Risk | Mitigation |
|------|-----------|
| Long job blocks UI | Progress state non-blocking; allow cancel/leave |
