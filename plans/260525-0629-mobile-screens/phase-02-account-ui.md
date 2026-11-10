---
title: "Phase 02: Account UI (Track A)"
description: "Native-mobile UI polish for profile + wallet, both platforms; presentational only"
status: pending
priority: P1
effort: 6h
track: A
---

# Phase 02: Account UI (Track A)

> Parallel-runnable with Phase 03 (Track B). NO blocks/blockedBy between them. Presentational only — real wiring happens in Phase 04.

## Screen refs (/k)
- profile (account/profile), wallet (wallet details panel)

## Goal
Native-mobile UI for profile (avatar/banner, name, email, fields) + wallet balance/details, both platforms. Keep state-based nav (account tab). Use design content as placeholder props (no invented data); props/interfaces match the DTOs wired in Phase 03/04.

## Files to modify
- Android: `androidApp/.../features/account/AccountScreen.kt` (split sub-composables if >200 lines: `AccountProfileSection.kt`, `AccountWalletSection.kt`)
- iOS: `iosApp/KMAEduApp/Views/AccountView.swift` (split subviews if needed: `AccountProfileSection.swift`, `AccountWalletSection.swift`)

## Out of scope
- API calls, ViewModels, multipart upload logic (Phase 03/04). No subscription panel (deferred).

## Integration contract (props the UI must accept)
- Profile: `name, email, avatarUrl, bannerUrl, role` + edit callbacks (onSave, onPickAvatar, onPickBanner)
- Wallet: `balance, currency` + transactions list (optional)

## Todo
- [ ] Android profile + wallet UI native-mobile, stateless props
- [ ] iOS profile + wallet UI native-mobile, stateless props
- [ ] Files < 200 lines each
