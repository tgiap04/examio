---
title: "Phase 16: History Integration"
description: "Wire History UI to HistoryViewModel; remove LichSuScreen + HomeDashboard mock"
status: pending
priority: P1
effort: 3h
track: Integration
---

# Phase 16: History Integration

> BlockedBy Phase 14 (UI) + Phase 15 (logic).

## Context Links
- Phase 14 (UI), Phase 15 (VM/repo)

## Overview
Connect History dashboard + exam + pdf sections to HistoryViewModel; replace mock; wire pagination.

## Requirements
- Three History sections render real data on BOTH platforms.

## Related Code Files

### Modify
- Android: `LichSuScreen.kt` — inject HistoryViewModel, collect state
- iOS: `HistoryView.swift` (from Phase 14) — observe HistoryViewModel

### Delete (mock — exact)
- Android: `LichSuScreen.kt` mock blocks **L36-43** and **L71**; `HomeDashboardModels.kt` mock **L21-28**
- iOS: `HomeView.swift` mock block **L45-53**

## Implementation Steps
1. Inject HistoryViewModel; collect three section states.
2. Wire pagination on exam + pdf lists.
3. Remove listed mock blocks; delete unused symbols.
4. Build Android + iOS.

## Todo
- [ ] History sections wired (both platforms)
- [ ] Android mock removed (LichSuScreen L36-43/L71, HomeDashboardModels L21-28)
- [ ] iOS mock removed (HomeView L45-53)
- [ ] Both builds green

## Success Criteria
- History tab shows real stats + exam + pdf on both platforms; zero mock remains in History.

## Risks
| Risk | Mitigation |
|------|-----------|
| HomeDashboardModels mock shared with Home tab | Confirm L21-28 is history-only before deleting; Home left intact |
