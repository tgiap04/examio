# Plan: Remake Profile Page (`/k/profile`)

## Overview
Rewrite the profile page to match the Anthropic-inspired design system (`DESIGN.md`) and integrate the existing `ProfileForm`, `ChangePasswordSection`, and `DeviceList` components. 

The current page has redundancy: banner/avatar and basic info are shown twice (once in the page hero, and once in the ProfileForm). 
We will split this into a modern 12-column split layout:
- **Left Panel (col-span-4)**: A sticky card summarizing the profile visually (cover, avatar, name, verification status, bio, email, join date, wallet balance, and profile completeness). It supports uploading avatar and banner.
- **Right Panel (col-span-8)**: A tabbed container containing:
  - Tab 0: Profile Settings (ProfileForm focusing on text editing and email verification triggers)
  - Tab 1: Security (ChangePasswordSection)
  - Tab 2: Devices (DeviceList)

## Design Direction

Based on `DESIGN.md` + `globals.css`:
- **Canvas**: `#faf9f5` (background)
- **Coral primary**: `#cc785c`
- **Surface card**: `#efe9de`
- **Typography**: Cormorant Garamond (display) + Inter (body)
- **Border radius**: 12px cards, 8px buttons/inputs
- **Spacing**: 4px base unit, generous padding (24–32px)

## Proposed Layout Grid (Desktop)

```
┌──────────────────────────────────────────────┬──────────────────────────────────────────────┐
│  [Sticky Sidebar Summary - 4 cols]           │  [Settings Panel - 8 cols]                   │
│                                              │                                              │
│  ┌────────────────────────────────────────┐  │  ┌────────────────────────────────────────┐  │
│  │  Cover Banner (Edit on hover)          │  │  │  Tabs: [Hồ sơ]  [Bảo mật]  [Thiết bị]   │  │
│  │  Avatar overlay (Edit on hover)         │  │  └────────────────────────────────────────┘  │
│  │  Name, Username, Verification badge    │  │                                              │
│  │  Bio & Info                             │  │  ┌────────────────────────────────────────┐  │
│  │  Wallet Balance Indicator               │  │  │  Tab Content Area                      │  │
│  │  Profile Strength Progress Bar          │  │  │                                        │  │
│  │  Email, Joined Date                     │  │  │  (ProfileForm / Security / Devices)    │  │
│  └────────────────────────────────────────┘  │  │                                        │  │
│                                              │  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┴──────────────────────────────────────────────┘
```

## Implementation Steps

### Phase 1: Simplify `ProfileForm.tsx`
- Remove duplicate banner and avatar upload sections.
- Remove duplicate read-only information except in standard details layout.
- Focus on Display Name and Bio fields.
- Add an verification reminder banner if the user's email is not verified, with a functional button to trigger `sendVerificationEmail` from `useAuthStore`.

### Phase 2: Redesign `ProfilePage.tsx`
- Move all banner/avatar upload HTML and handlers to the left sidebar panel of the page.
- Layout the page as a 12-column grid on desktop, stacking on mobile.
- Render the sticky profile card on the left.
- Render the tabs and form elements on the right.
- Add profile strength computation (progress bar).
- Add wallet balance display (using `user.wallet.balance` from `useAuthStore`).
- Ensure proper styling using design variables and typography.

### Phase 3: Verify & Build
- Run `cd kmaedu-fe && yarn build` to verify no compile errors
- Check that all features work properly (uploads, profile edits, email verifications).
