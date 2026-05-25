---
title: "Phase 9: Navigation Wiring"
description: "Deep links, back stack management, auth guard, and tab routing integration"
status: pending
priority: P2
effort: 8h
---

# Phase 9: Navigation Wiring

## Context

- [Frontend routes](../../examio-fe/src/routes/index.tsx)
- [Existing navigation](../../examio-app/androidApp/src/main/kotlin/com/examio/app/navigation/BottomTabBar.kt)
- [MainTab enum](../../examio-app/shared/src/commonMain/kotlin/com/examio/app/features/navigation/MainTab.kt)
- Depends on: Phase 2-8 (all screens must exist)

## Overview

Wire all screens together with proper navigation: auth guard (show login when unauthenticated), tab bar with nested navigation stacks, deep linking for shared exam/flashcard URLs, and proper back stack management.

## Requirements

### Functional
- Auth guard: unauthenticated -> auth flow; authenticated -> tab bar
- Each tab has its own navigation stack (back button within tab)
- Deep links: `examio://exam-session/:id`, `examio://flashcard/:id`, `examio://chat/:id`
- Shared URLs open correct screen (e.g., exam session invite link)
- Teacher screens accessible from Account tab when role = Teacher
- Tab badge (optional): unread AI messages count

### Non-Functional
- Tab switch preserves navigation state within each tab
- Back gesture/button works correctly within nested stacks
- No duplicate screens on stack from repeated navigation

## Route Map

```
App Root
├── Auth Flow (when unauthenticated)
│   ├── Login
│   ├── Register
│   ├── ForgotPassword
│   └── ResetPassword
│
└── Main Tab Bar (when authenticated)
    ├── Home Tab
    │   └── HomeView (flat, no sub-navigation)
    │
    ├── Study Tab
    │   ├── MyMaterialsView
    │   └── FlashcardStudyView(setId)
    │
    ├── My Exams Tab
    │   ├── MyExamsView
    │   ├── ExamSessionView(sessionId)
    │   ├── ExamQuizView(attemptId)
    │   └── ExamResultView(attemptId)
    │
    ├── AI Tab
    │   ├── AITabView (Teacher/Tool/History segments)
    │   ├── AIChatView(chatId)
    │   └── (History detail views)
    │
    └── Account Tab
        ├── AccountView
        ├── ProfileEditView
        ├── WalletView
        ├── SubscriptionView
        ├── ChangePasswordView
        └── Teacher Screens (role-gated)
            ├── TeacherFlashcardsView
            ├── FlashcardSetDetailView(setId)
            ├── TeacherQuizSetsView
            ├── QuizSetDetailView(setId)
            ├── ExamRoomsView
            └── ExamRoomDetailView(roomId)
```

## Files to Create/Modify

### iOS

| File | Action | Purpose |
|------|--------|---------|
| `iosApp/ExamioApp/ContentView.swift` | Modify | Auth guard + tab bar with NavigationStacks |
| `iosApp/ExamioApp/Navigation/AppRouter.swift` | Create | Centralized navigation state |
| `iosApp/ExamioApp/Navigation/DeepLinkHandler.swift` | Create | Parse and route deep links |

### Android

| File | Action | Purpose |
|------|--------|---------|
| `androidApp/.../ExamioApp.kt` | Modify | Auth guard + NavHost setup |
| `androidApp/.../navigation/AppNavGraph.kt` | Create | Root nav graph with nested graphs |
| `androidApp/.../navigation/BottomTabBar.kt` | Modify | Wire to real nav destinations |
| `androidApp/.../navigation/DeepLinkHandler.kt` | Create | Deep link intent handling |

### Shared

| File | Action | Purpose |
|------|--------|---------|
| `shared/.../features/navigation/DeepLink.kt` | Create | Deep link route definitions |
| `shared/.../features/navigation/AuthState.kt` | Create | Observable auth state for navigation |

## Implementation Steps

1. Define `AuthState` in shared: `sealed interface { Authenticated(UserSession), Unauthenticated, Loading }`
2. Root composable/view observes `AuthState` and switches between auth flow and tab bar
3. **iOS**: Use `NavigationStack` per tab inside `TabView`; use `@Observable` router
4. **Android**: Use `NavHost` with nested `navigation()` blocks per tab; `BottomNavigation` with `saveState`
5. Define deep link routes in shared `DeepLink` sealed class
6. **iOS**: Handle `onOpenURL` in app entry, parse to `DeepLink`, push to correct tab/screen
7. **Android**: Define `<intent-filter>` in manifest + handle in `NavHost` deepLinks
8. Auth guard: on token expiry/logout, reset nav state to auth flow
9. Teacher screen access: in Account tab nav, conditionally show "Manage Content" row
10. Test: tab switching preserves state, deep links open correct screen, back works

## Deep Link Scheme

```
examio://exam-session/{sessionId}     -> My Exams tab -> ExamSessionView
examio://flashcard/{setId}            -> Study tab -> FlashcardStudyView
examio://chat/{chatId}                -> AI tab -> AIChatView
examio://profile                      -> Account tab -> ProfileView
```

Also handle HTTPS links (universal/app links):
```
https://examio.vn/exam-session/{id}   -> same as above
https://examio.vn/study/{id}          -> same as above
```

## Success Criteria

- [ ] Unauthenticated user sees only auth flow
- [ ] Authenticated user sees tab bar with all 5 tabs
- [ ] Each tab maintains its own back stack
- [ ] Tab switch does not reset other tab's navigation state
- [ ] Deep links open correct screen in correct tab
- [ ] Back button/gesture navigates within tab, not between tabs
- [ ] Logout resets all navigation state to auth flow
- [ ] Teacher screens only accessible with Teacher role
- [ ] No duplicate screens on repeated navigation to same destination

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Complex nested navigation state | Use established patterns (NavigationStack iOS, nested NavGraph Android) |
| Deep link handling when app is cold-started | Queue deep link, process after auth check completes |
| State loss on process death (Android) | Use SavedStateHandle in ViewModels |

## Rollback

Navigation changes touch root files. Revert ContentView.swift and ExamioApp.kt to previous state (tab bar with placeholders).
