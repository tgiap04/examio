# F002 - Account Verification & Profile Security Screens

## Screen List
- SCR013 `/k/profile` - Profile form, devices, and password change.
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
5. User opens `/k/profile` to edit profile fields or upload avatar/banner media.
6. User reviews device/session list and logs out an unwanted session.
7. User may change password from the profile/security area through authenticated password-change flow.

## Artifact References
- `screen-list.md` SCR013-SCR014, REG003, SCR114-SCR115, SCR211
- `screen-flow.md` FLW010, FLW013, FLW050-FLW051, FLW106, FLW206
- Source paths: profile screen/component paths Need verification beyond API artifacts.
