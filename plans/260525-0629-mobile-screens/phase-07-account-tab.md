---
title: "Phase 7: Account Tab"
description: "Profile view/edit and Subscription/Wallet screens"
status: pending
priority: P2
effort: 10h
---

# Phase 7: Account Tab

## Context

- [ProfilePage](../../examio-fe/src/pages/k/ProfilePage.tsx)
- [SubscriptionPage](../../examio-fe/src/pages/k/SubscriptionPage.tsx)
- [Profile API](../../examio-fe/src/apis/profileApi.ts)
- [Subscription API](../../examio-fe/src/apis/subscriptionApi.ts)
- Depends on: Phase 1 (shared), Phase 2 (auth)

## Overview

Account tab shows user profile (view/edit name, bio, avatar, banner) and wallet/subscription info (balance, transaction history, subscription plan, payment).

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /profile` | Get user profile |
| `PUT /profile` | Update profile |
| `POST /profile/upload-avatar` | Upload avatar image |
| `POST /profile/upload-banner` | Upload banner image |
| `GET /wallet/details?page&size` | Wallet + transactions |
| `GET /payment/subscription` | Current subscription |
| `GET /payment/subscription/plans` | Available plans |
| `POST /payment/create` | Create payment (QR) |
| `GET /payment/status/:id` | Check payment status |
| `POST /auth/send-code-change-password` | Send change password code |
| `POST /auth/change-password` | Change password |
| `POST /auth/logout` | Logout |

## Files to Create

### iOS (`iosApp/ExamioApp/Features/Account/`)

| File | Purpose |
|------|---------|
| `AccountTabView.swift` | Tab root with navigation |
| `ProfileView.swift` | Profile display + edit |
| `ProfileViewModel.swift` | Profile state, upload |
| `EditProfileSheet.swift` | Edit name/bio sheet |
| `WalletView.swift` | Balance + transactions |
| `WalletViewModel.swift` | Wallet state, pagination |
| `TransactionRow.swift` | Transaction list item |
| `SubscriptionView.swift` | Current plan + upgrade |
| `ChangePasswordView.swift` | Change password form |
| `SettingsView.swift` | Logout, app info |

### Android (`androidApp/src/main/kotlin/com/examio/app/features/account/`)

| File | Purpose |
|------|---------|
| `AccountNavGraph.kt` | Navigation graph |
| `AccountScreen.kt` | Tab root (replaces placeholder) |
| `ProfileScreen.kt` | Profile display + edit |
| `ProfileViewModel.kt` | Profile state, upload |
| `EditProfileDialog.kt` | Edit name/bio dialog |
| `WalletScreen.kt` | Balance + transactions |
| `WalletViewModel.kt` | Wallet state, pagination |
| `TransactionItem.kt` | Transaction list item |
| `SubscriptionScreen.kt` | Current plan + upgrade |
| `ChangePasswordScreen.kt` | Change password form |
| `SettingsScreen.kt` | Logout, app info |

### Files to Modify

| File | Change |
|------|--------|
| `iosApp/ExamioApp/Views/AccountView.swift` | Replace with AccountTabView |
| `androidApp/.../features/account/AccountScreen.kt` | Replace with AccountNavGraph entry |

## Implementation Steps

### Profile
1. Create `ProfileViewModel` consuming `AccountRepository`
2. Display: avatar (circular), banner, name, username, email, bio, verified badge
3. Edit mode: tap edit button -> sheet/dialog with name + bio fields
4. Avatar upload: image picker -> upload to R2 -> update profile
5. Banner upload: same flow

### Wallet & Subscription
6. Create `WalletViewModel` consuming `AccountRepository`
7. Display balance prominently at top
8. Transaction list with pagination (amount, type label, direction icon, date)
9. Subscription section: current tier, benefits, upgrade CTA
10. Payment flow: select credits/plan -> show QR code -> poll status

### Settings
11. Change password: send code -> enter code + current + new password
12. Logout button -> confirm -> clear tokens -> navigate to auth flow
13. App version info

## Data Flow

```
ProfileView -> ProfileViewModel.loadProfile()
  -> AccountRepository.getProfile() -> UserProfile
  -> UI renders

WalletView -> WalletViewModel.loadWallet(page)
  -> AccountRepository.getWalletDetails(page, size) -> WalletDetails
  -> UI renders balance + transaction list
```

## Success Criteria

- [ ] Profile displays all fields correctly
- [ ] Avatar/banner upload works with image picker
- [ ] Edit name/bio saves to backend
- [ ] Wallet balance displayed
- [ ] Transaction list paginates
- [ ] Subscription tier shown with benefits
- [ ] Change password flow works (send code -> verify -> change)
- [ ] Logout clears session and returns to login

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Image upload large files | Compress before upload; limit to 5MB |
| Payment QR display on small screens | Make QR zoomable; show bank details as text fallback |
| Payment status polling | Poll every 5s with timeout; show manual check button |

## Rollback

Revert AccountView/AccountScreen to placeholder. Account-specific files are additive.
