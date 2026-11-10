---
title: "Phase 03: Account Repo + ViewModel Wiring (Track B)"
description: "AccountRepository + ProfileViewModel/WalletViewModel: profile GET/PUT, multipart avatar/banner, wallet details"
status: pending
priority: P1
effort: 6h
track: B
---

# Phase 03: Account Repo + ViewModel Wiring (Track B)

> BlockedBy Phase 01 only. Parallel-runnable with Phase 02 (Track A). NO A↔B block.

## Context Links
- DTO source: `../../examio-fe/src/apis/profileApi.ts`
- Shared: `AccountRepository.kt`, `ProfileApiService.kt`, `WalletApiService.kt`
- Multipart helper from Phase 01

## Overview
Build platform ViewModels over the existing `AccountRepository` for profile + wallet, including multipart avatar/banner upload. Repository already exists — verify/patch DTOs, then add VMs with loading/error/success state.

## Requirements

### Endpoints
- GET /profile, PUT /profile
- multipart avatar upload, multipart banner upload (via Phase 01 MultipartUploadHelper)
- GET /wallet/details

### DTOs to verify against `profileApi` (cite before coding)
- Profile: `id, name, email, avatarUrl, bannerUrl, role, createdAt` (+ any editable fields PUT accepts)
- Wallet: `balance, currency` (+ transactions if present)

### Behavior
- Loading/error/empty states; optimistic-safe save (re-fetch on success); upload progress flag; field validation (name non-empty, email format if editable).

## Related Code Files

### Create
- Android: `androidApp/.../features/account/ProfileViewModel.kt`, `WalletViewModel.kt`
- iOS: `iosApp/ExamioApp/ViewModels/ProfileViewModel.swift`, `WalletViewModel.swift`

### Modify
- `shared/.../features/account/repository/AccountRepository.kt` (add multipart upload fns if missing)
- `shared/.../features/account/api/ProfileApiService.kt` (DTO patch if drift)

## Implementation Steps
1. Verify Profile/Wallet DTOs vs `profileApi`; patch shared DTOs if drift.
2. Add `uploadAvatar(file)`, `uploadBanner(file)` to AccountRepository using MultipartUploadHelper.
3. Android VMs: expose `StateFlow<UiState>` for profile + wallet; suspend calls via repo.
4. iOS VMs: `@Published` state mirroring Android VM contract; call shared repo via Kotlin interop.
5. Unit-test repo mapping + VM state transitions (load→success / load→error).

## Todo
- [ ] DTOs verified vs profileApi
- [ ] AccountRepository multipart upload fns
- [ ] ProfileViewModel + WalletViewModel (Android)
- [ ] ProfileViewModel + WalletViewModel (iOS)
- [ ] State transitions unit-tested

## Success Criteria
- VMs load real profile + wallet via repo; avatar/banner upload returns new URL; errors surfaced as state.

## Risks
| Risk | Mitigation |
|------|-----------|
| Multipart field naming mismatch w/ BE | Mirror profileApi form field keys exactly |
| iOS VM duplicating shared logic | Keep logic in repo; VM only adapts to @Published |
