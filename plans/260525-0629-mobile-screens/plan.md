---
title: "Examio Mobile App Screens Implementation"
description: "Implement all mobile screens (iOS + Android) mirroring examio-fe, excluding landing pages"
status: pending
priority: P1
effort: 120h
branch: feat/mobile-screens
tags: [mobile, kmp, ios, android, swiftui, compose]
created: 2026-05-25
---

# Examio Mobile App Screens

## Overview

Implement all screens for `examio-app/` to match `examio-fe/` functionality. Uses KMP shared layer for models/API/session, SwiftUI for iOS, Jetpack Compose for Android.

## Architecture

```
shared/ (KMP)         -> Models, API interfaces, repositories, session logic
iosApp/               -> SwiftUI views, ViewModels, platform DI
androidApp/           -> Compose screens, ViewModels, platform DI
```

## Phases

| # | Phase | Effort | Status | Blocks |
|---|-------|--------|--------|--------|
| 1 | [Shared KMP Foundation](./phase-01-shared-kmp-foundation.md) | 20h | Pending | 2-9 |
| 2 | [Auth Flow](./phase-02-auth-flow.md) | 12h | Pending | 3-8 |
| 3 | [Home Tab](./phase-03-home-tab.md) | 8h | Pending | — |
| 4 | [Study Tab](./phase-04-study-tab.md) | 14h | Pending | — |
| 5 | [My Exams Tab](./phase-05-my-exams-tab.md) | 16h | Pending | — |
| 6 | [AI Tab](./phase-06-ai-tab.md) | 18h | Pending | — |
| 7 | [Account Tab](./phase-07-account-tab.md) | 10h | Pending | — |
| 8 | [Teacher Screens](./phase-08-teacher-screens.md) | 14h | Pending | — |
| 9 | [Navigation Wiring](./phase-09-navigation-wiring.md) | 8h | Pending | 2-8 |

## Key Decisions

- KMP shared layer owns all data models, API client interfaces, and repository contracts
- Platform ViewModels consume shared repositories; UI is fully native per platform
- SSE streaming (AI chat) handled via platform-specific implementations behind a shared interface
- Auth guard at navigation level; token refresh handled in shared HTTP client
- Pagination uses cursor/offset pattern matching backend APIs
- OAuth mobile redirect scheme: `examio://` (confirmed 2026-05-25)
- No offline cache — always-online only (confirmed 2026-05-25)

## Risk Summary

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SSE streaming complexity on KMP | Medium | High | Platform-specific impl behind expect/actual |
| Secure quiz encryption on mobile | Medium | High | Use platform crypto libs (CryptoKit/javax.crypto) |
| File upload (multipart) on KMP | Low | Medium | Use Ktor multipart support |
| Large screen count delays delivery | High | Medium | Prioritize by tab; ship incrementally |

## Success Criteria

- All 5 tabs functional with real API data
- Auth flow complete (login, register, forgot/reset password)
- Teacher role screens accessible when role = Teacher
- AI chat streaming works on both platforms
- Exam taking with secure quiz flow works end-to-end
