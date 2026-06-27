---
title: "Phase 17: Cross-Cutting Cleanup"
description: "Remove ALL remaining mock, delete AiScreen.kt dead code, optionally dedupe iOS AuthApiClient; final zero-mock verification"
status: pending
priority: P2
effort: 4h
track: Cleanup
---

# Phase 17: Cross-Cutting Cleanup

> BlockedBy ALL integration phases (04, 07, 10, 13, 16). Final sweep.

## Context Links
- Report tech-debt notes; all integration phases

## Overview
Final sweep to guarantee zero mock in the codebase, remove dead code, and (optional) dedupe the iOS auth client. Each integration phase removes its own mock; this phase verifies none remain and clears global dead code.

## Requirements
- Zero mock symbols anywhere in androidApp + iosApp.
- AiScreen.kt (dead code) deleted; AIToolScreen.kt remains the live tab.
- Optional: iOS inline AuthApiClient deduped onto shared AuthApiService.

## Related Code Files

### Delete (dead code)
- Android: `androidApp/.../features/ai/AiScreen.kt` (DEAD — not the live tab)

### Verify mock removed (any leftover from teacher/home placeholders)
- Android: `TeacherModels.kt` mock **L18-30** (remove if teacher placeholder still references it)
- iOS: `TeacherView.swift` mock **L50-63**

### Optional dedupe (NOT critical path)
- iOS: replace inline `AuthApiClient` usage with shared `AuthApiService` (remove duplication)

## Implementation Steps
1. Delete `AiScreen.kt`; confirm no references.
2. Grep both platforms for `mock`, `sample`, `placeholder`, hardcoded fixture lists; remove any leftover.
3. Remove TeacherModels/TeacherView mock if teacher screens are placeholder-only and unused.
4. (Optional) Dedupe iOS AuthApiClient → shared AuthApiService.
5. Build Android + iOS; full smoke pass across all wired tabs.

## Todo
- [ ] AiScreen.kt deleted, no references
- [ ] Grep confirms zero mock/sample fixtures in androidApp + iosApp
- [ ] TeacherModels L18-30 / TeacherView L50-63 mock removed (if applicable)
- [ ] (Optional) iOS AuthApiClient deduped
- [ ] Both builds green; smoke pass

## Success Criteria
- `grep -ri "mock\|sampleQuestions" androidApp iosApp` returns no fixture data.
- AiScreen.kt gone. Both apps build and all in-scope tabs show real data.

## Risks
| Risk | Mitigation |
|------|-----------|
| Deleting AiScreen.kt breaks a stray reference | Grep references first |
| iOS AuthApiClient dedupe regresses auth | Keep optional; only if time permits; re-test login |
