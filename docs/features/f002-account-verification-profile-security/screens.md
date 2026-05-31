# F002 - Account Verification & Profile Security Screens

## Screen List
- SCR013 `/k/profile` - Profile page with tabbed interface: **Profile** tab (avatar, banner, name, bio, email), **Security** tab (change password), **Devices** tab (active devices/sessions with logout). Uses `ProfileForm`, `ChangePasswordSection`, `DeviceList` subcomponents.
- SCR014 `/k/verify` - Account email verification.
- REG003 KLayout - Workspace shell that can show verification banner and pending job dialog.
- SCR114 Android AccountScreen - Mock-backed account/profile/wallet/settings UI; repository wiring Needs verification.
- SCR115 Android ProfileSheet - Mixed backing; logout likely real, profile data Needs verification.
- SCR211 iOS AccountView - Mock-backed account view.

## User Journey
1. Authenticated user enters the workspace.
2. If the account is unverified, the workspace can surface a verification prompt.
3. User opens `/k/verify`, requests or enters a verification code, and submits it.
4. User returns to workspace or the prior page. Exact post-verification route Needs verification.
5. User opens `/k/profile` — profile data is loaded via `getProfileApi()` (separate from auth store).
6. User switches between **Profile** tab (edit name, bio, upload avatar/banner), **Security** tab (change password with current password and OTP code), and **Devices** tab (view active sessions, logout remote devices, logout all other sessions).
7. Avatar upload triggers local preview (`FileReader`) before persisting to R2 via `uploadAvatarApi`.
8. User reviews device/session list and logs out an unwanted session.
9. User may change password from the Security tab through authenticated password-change flow with current password validation and OTP verification.

## Artifact References
- `screen-list.md` SCR013-SCR014, REG003, SCR114-SCR115, SCR211
- `screen-flow.md` FLW010, FLW013, FLW050-FLW051, FLW106, FLW206
- Source paths: profile screen/component paths Need verification beyond API artifacts.
