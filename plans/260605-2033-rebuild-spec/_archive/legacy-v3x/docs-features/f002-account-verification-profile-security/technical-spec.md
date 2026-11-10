# F002 - Account Verification & Profile Security Technical Spec

## Functional Requirements
- FR001: The system shall let authenticated users request a verification email/code through `/api/v1/auth/sendVerificationEmail`.
- FR002: The system shall let authenticated users submit verification through `/api/v1/auth/verifyAccount` and update account verification state.
- FR003: The system shall display account verification access from `/k/verify` and workspace verification notices.
- FR004: The system shall let authenticated users view and update their own profile details through profile APIs (`getProfileApi`, `updateProfileApi`).
- FR005: The system shall let authenticated users upload avatar and banner media through R2-backed image upload routes (`uploadAvatarApi`, `uploadBannerApi`).
- FR006: The system shall let authenticated users view and manage their own active devices/sessions.
- FR007: The system shall let authenticated users change password through authenticated password-change routes.
- FR008: The Profile page (`/k/profile`) shall display user info in three tabs: **Profile** (avatar/banner, name, bio, email), **Security** (change password section), and **Devices** (active session/device list with logout capability).

## Business Rules
- BR001: Only authenticated users can verify their own account.
- BR002: Only authenticated users can view or update their own profile.
- BR003: Only authenticated users can manage their own devices/sessions.
- BR004: Avatar/banner media is stored through R2-backed storage; deletion behavior for replaced assets Needs verification.
- BR005: Session/device management uses `x-device-id` and session ownership checks.

## State Machines
- SM001 Verification state: unverified -> verification email requested -> code submitted -> verified, or code rejected -> unverified.
- SM002 Device session state: active -> logout/deactivated -> removed from active device list. Cleanup cron behavior Needs verification.
- SM003 Profile media state: no media/existing media -> upload pending -> uploaded URL saved -> profile displays new media.

## Algorithms
- ALG001: Client includes auth token and `X-Device-ID`; backend associates requests with the tracked session/device.
- ALG002: Profile image upload first obtains/uses R2-backed media route, then profile data references the returned URL/key. Exact sequence Needs verification.

## Integrations
- INT001: Gateway prefixes `/api/v1/auth/*`, `/api/v1/profile/*`, `/api/v1/devices/*`, and `/api/v1/r2/*`.
- INT002: Web uses `profileApi.ts`, `devicesApi.ts`, `mediaApi.ts`, and profile/account screens.
- INT003: R2 service exposes upload/get/delete/list through gRPC and HTTP proxy routes.
- INT004: Mobile shared profile/account API exists, but platform account/profile UIs are mostly mock-backed except auth/logout.

## Key Entities
- MODEL001 `User`
- MODEL002 `UserSession`
- MODEL003 `VerifyAccountCode`
- MODEL024/MODEL027 `UserStorage` naming discrepancy Needs verification in artifacts
- MODEL034 `r2.proto`

## Artifact References
- `feature-list.md` F002
- `user-stories.md` US004, US015
- `screen-list.md` SCR013, SCR014, SCR114-SCR115, SCR211
- `screen-flow.md` FLW013, FLW050-FLW051, FLW106, FLW206
- `behavior-logic.md` BL003-BL004, BL009, BL057, BL070-BL072
- `api-map.md` API002, API012
- `permissions.md` PERM009-PERM011, PERM038, PERM040
- Source paths: `kmaedu-fe/src/apis/profileApi.ts`, `kmaedu-fe/src/apis/devicesApi.ts`, `kmaedu-fe/src/apis/mediaApi.ts`; backend route file paths Need verification.
