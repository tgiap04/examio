---
title: "Phase 04: Account Integration"
description: "Wire Account UI to ProfileViewModel/WalletViewModel; remove AccountModels mock"
status: pending
priority: P1
effort: 3h
track: Integration
---

# Phase 04: Account Integration

> BlockedBy Phase 02 (UI) + Phase 03 (logic). Replaces mock with real repo/VM.

## Context Links
- Phase 02 (UI), Phase 03 (VMs/repo)

## Overview
Connect the presentational Account UI to ProfileViewModel/WalletViewModel; replace hardcoded mock with real data; wire avatar/banner pickers to multipart upload; delete mock.

## Requirements
- Profile + wallet render real API data on BOTH platforms.
- Edit/save + avatar/banner pick→upload→refresh works.
- Loading/error/empty states visible.

## Related Code Files

### Modify
- Android: `AccountScreen.kt` — inject ProfileViewModel/WalletViewModel, collect state
- iOS: `AccountView.swift` — observe VMs

### Delete (mock — exact)
- Android: `AccountModels.kt` mock block **L17-30**
- iOS: `AccountView.swift` mock block **L143-155**

## Implementation Steps
1. Inject VMs into AccountScreen / AccountView.
2. Replace mock props with collected state.
3. Wire avatar/banner file pickers → VM upload → re-fetch.
4. Remove the listed mock blocks; delete now-unused mock symbols.
5. Build Android + iOS.

## Todo
- [ ] Android wired, mock L17-30 removed
- [ ] iOS wired, mock L143-155 removed
- [ ] Avatar/banner upload round-trips
- [ ] Both builds green

## Success Criteria
- Account tab shows real profile + wallet on both platforms; zero mock remains in Account.

## Risks
| Risk | Mitigation |
|------|-----------|
| Picker permission flows differ per platform | Use platform-native picker; handle denied state |
