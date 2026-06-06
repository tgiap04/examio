# SCR013_ProfilePage — Screen Spec

**Screen**: SCR013: ProfilePage
**Type**: composite
**Route**: `/k/profile`
**Generated**: 2026-06-06

## Purpose

Authenticated users view and edit their profile (name, bio, avatar, banner), change their password, and manage active login sessions across devices. Encountered when navigating to the profile section from the app sidebar or menu.

---

## Screen Layout

The page uses a two-column grid layout at large viewports: a sticky left summary card (4/12 columns) and a right tabbed content panel (8/12 columns). The left card is static on desktop but moves to the top on mobile stacked layout. Tab buttons render inline at the top of the right column, controlling which of three independent content regions renders below. The page max-width is capped at `max-w-7xl` with responsive padding. (source: `ProfilePage.tsx:155`)

### Layout Sketch

```
┌──────────────────────────────────────────────────────────────┐
│  R1: Page Header — "Hồ sơ cá nhân" title + subtitle          │
├─────────────────────┬────────────────────────────────────────┤
│ R2: Left Sticky     │ R3: Tab Bar — Profile / Security /     │
│ Summary Card        │              Devices                   │
│ (lg:sticky top-24)  ├────────────────────────────────────────┤
│                     │ R4: Active Tab Content (scrollable)     │
│ - Avatar + Banner   │   ProfileForm | ChangePasswordSection  │
│ - Completeness bar  │   | DeviceList                         │
│ - Wallet balance    │                                        │
│ - Email + join date │                                        │
└─────────────────────┴────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | Page Header | static | no | Title + subtitle | Always visible, fluid width |
| R2 | Left Summary Card | sticky (lg), static (sm) | yes | Avatar/banner upload zones, completeness bar, wallet balance card | Hidden on xs; full-width stacked on sm; sticky sidebar on lg |
| R3 | Tab Bar | static | no | Three tab `<button>` elements | `overflow-x-auto` on sm; inline-flex on md+ |
| R4 | Tab Content | static | yes | ProfileForm / ChangePasswordSection / DeviceList | Fluid, full width |

---

## User Flow

### Happy Path

1. User lands on `/k/profile`; profile data fetches via `GET /profile`; left summary card renders with avatar initials (or image), wallet balance, email, and join date. R1: left card
2. Default active tab is `profile`; `ProfileForm` renders in R4 showing editable name and bio fields. R4: tab content
3. User clicks avatar or banner area → hidden `<input type="file">` triggers; on file select `uploadAvatarApi` or `uploadBannerApi` is called; on success `handleProfileUpdate` PATCHes the profile. R2: avatar/banner zone
4. User types in name/bio fields; save button enables when `hasChanges`; on submit `updateProfileApi` fires; on success toast confirms and `getUser()` refreshes auth store. R4: ProfileForm
5. User clicks **Bảo mật** tab; `ChangePasswordSection` renders; user clicks "Đổi mật khẩu"; `sendCodeChangePasswordApi` sends OTP; step transitions to `verify`. R3 → R4
6. User enters 6-digit OTP + current password + new password (6+ chars) + confirm; on submit `changePasswordApi` fires; on success step → `success`, then resets after 3 s. R4: ChangePasswordSection
7. User clicks **Thiết bị** tab; `DeviceList` renders; `getDevicesApi` fetches active sessions; current device shown with coral highlight; other devices listed with per-device logout button. R4: DeviceList
8. User clicks "Đăng xuất tất cả" on other devices → `logoutAllOthersApi` fires; `devices` list filters to current only. R4: DeviceList

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| Profile load fails | `getProfileApi` throws | Error toast shown; spinner replaced with error state | `ProfilePage.tsx:57` |
| `user.isVerified` is true | profile response | "Đã xác minh" badge shown in left card | `ProfilePage.tsx:241` |
| `user.isVerified` is false | profile response | "Chưa xác minh" warning badge + resend email button in ProfileForm | `ProfileForm.tsx:65` |
| No changes made | name/bio unchanged from profile | Save button disabled | `ProfileForm.tsx:27` |
| New password < 6 chars | `newPassword.length < 6` | Warning text; submit button disabled | `ChangePage.tsx:228` |
| Confirm password mismatch | `newPassword !== confirmPassword` | Error text "Mật khẩu xác nhận không khớp" | `ChangePasswordSection.tsx:222` |
| Avatar upload fails | `uploadAvatarApi` throws | Error toast; upload spinner resets | `ProfilePage.tsx:101` |
| Devices list empty | `devices.length === 0` | Empty state with icon shown in DeviceList | `DeviceList.tsx:161` |
| Logout device fails | `logoutDeviceApi` throws | Error toast; device remains in list | `DeviceList.tsx:49` |

---

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| `profile.name` | Tên hiển thị | API field | raw string, max 100 chars | dash | MODEL-001.name |
| `profile.bio` | Giới thiệu | API field | raw string, max 500 chars | hidden (no bio block rendered) | MODEL-001.bio |
| `profile.email` | Email | API field | raw string | — | MODEL-001.email |
| `profile.username` | Tên đăng nhập | API field | raw string with `@` prefix | — | MODEL-001.username |
| `profile.avatar` | Avatar | API field | URL / initials fallback | shows initials | MODEL-001.avatar |
| `profile.banner` | Ảnh bìa | API field | URL / gradient fallback | shows gradient + upload prompt | MODEL-001.banner |
| `profile.isVerified` | Trạng thái xác minh | API field | boolean badge | "Chưa xác minh" badge | MODEL-001.isVerified |
| `profile.createdAt` | Ngày tham gia | API field | `DD tháng MM, YYYY` (vi-VN) | hidden | MODEL-001.createdAt |
| `completeness` | Độ hoàn thiện | computed (5 × 20%) | percentage + progress bar | — | N/A |
| `user?.wallet?.balance` | Số dư ví | store state | VND currency | `0` | MODEL-027.balance |
| `devices[].deviceName` | Tên thiết bị | API field | raw string | "Thiết bị hiện tại" / "Thiết bị không xác định" | MODEL-002.deviceName |
| `devices[].browser` | Trình duyệt | API field | raw string | "Trình duyệt" | MODEL-002.browser |
| `devices[].os` | Hệ điều hành | API field | raw string | "Hệ điều hành" | MODEL-002.os |
| `devices[].location` | Vị trí | API field | raw string | hidden | MODEL-002.city |
| `devices[].lastActivity` | Hoạt động cuối | API field | raw string (relative) | hidden | MODEL-002.lastActivity |
| `devices[].isCurrent` | Thiết bị hiện tại | API field | boolean | — | MODEL-002.isActive |

---

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `getProfileApi` in-flight on mount | Centered `Loader2` spinner on full min-height div | none | `ProfilePage.tsx:126` |
| empty | N/A (profile always has a user) | N/A | N/A | `ProfilePage.tsx:124` |
| error | `getProfileApi` throws | Error toast; spinner remains | retry by re-mounting | `ProfilePage.tsx:57` |
| saving | `updateProfileApi` in-flight | Save button spinner + "Đang lưu..." label | none | `ProfileForm.tsx:161` |
| success | `updateProfileApi` resolves | Success toast "Cập nhật hồ sơ thành công!" | dismiss | `ProfilePage.tsx:83` |
| uploading-avatar | `uploadAvatarApi` in-flight | Avatar overlay spinner; upload input disabled | none | `ProfilePage.tsx:103` |
| uploading-banner | `uploadBannerApi` in-flight | Banner overlay spinner | none | `ProfilePage.tsx:119` |
| devices-loading | `getDevicesApi` in-flight | `Loader2` spinner in DeviceList center | none | `DeviceList.tsx:98` |
| devices-empty | `devices.length === 0` after load | Empty state icon + text in DeviceList | none | `DeviceList.tsx:161` |
| devices-error | `getDevicesApi` throws | Error toast; DeviceList shows spinner | retry by re-mounting | `DeviceList.tsx:34` |
| logout-device | `logoutDeviceApi` in-flight | Per-device button spinner | none | `DeviceList.tsx:237` |
| logout-all | `logoutAllOthersApi` in-flight | "Đăng xuất tất cả" button spinner | none | `DeviceList.tsx:128` |

---

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| name | text | no | maxLength 100 | none | none (soft cap only) |
| bio | textarea | no | maxLength 500 | none | none (char counter shown) |
| currentPassword | password | yes (step=verify) | non-empty | none | "Điền mật khẩu hiện tại" (implicit via required attr) |
| newPassword | password | yes (step=verify) | minLength 6 | none | "Mật khẩu mới phải có ít nhất 6 ký tự!" |
| confirmPassword | password | yes (step=verify) | must equal newPassword | none | "Mật khẩu xác nhận không khớp" |
| code | text | yes (step=verify) | exact 6 digits | none | implicit via maxLength + required |
| avatar file | file | no | image/* MIME | none | — |
| banner file | file | no | image/* MIME | none | — |

### B) Server-side

#### Profile update
- **Endpoint:** `PUT /profile`
- **Request:** `{ name?: string, bio?: string, avatar?: string, banner?: string }`
- **Success:** `200` → success toast + auth store refresh + UI re-render
- **Errors:** `[UNVERIFIED] 4xx/5xx` server error messages from `axios` response — surfaced as error toast
- **Trigger:** Save button click in ProfileForm
- **Source:** `ProfilePage.tsx:81`

#### Avatar upload
- **Endpoint:** `POST /profile/upload-avatar`
- **Request:** `FormData` with `file` field
- **Success:** `200` → `{ url: string }` → `handleProfileUpdate` patches avatar URL
- **Errors:** `[UNVERIFIED]` — surfaced as error toast
- **Trigger:** File selected on avatar `<input>`
- **Source:** `ProfilePage.tsx:97`

#### Banner upload
- **Endpoint:** `POST /profile/upload-banner`
- **Request:** `FormData` with `file` field
- **Success:** `200` → `{ url: string }` → `handleProfileUpdate` patches banner URL
- **Errors:** `[UNVERIFIED]` — surfaced as error toast
- **Trigger:** File selected on banner `<input>`
- **Source:** `ProfilePage.tsx:113`

#### Change password — send code
- **Endpoint:** `POST [authApi sendCodeChangePasswordApi]`
- **Request:** `{ }` (no body; auth token identifies user)
- **Success:** `200` → step transitions to `verify` + success toast "Mã xác minh đã được gửi đến email!"
- **Errors:** `[UNVERIFIED]` — surfaced as error toast
- **Trigger:** "Đổi mật khẩu" button click (step=initial)
- **Source:** `ChangePasswordSection.tsx:40`

#### Change password — submit
- **Endpoint:** `POST [authApi changePasswordApi]`
- **Request:** `{ code: string, currentPassword: string, newPassword: string }`
- **Success:** `200` → step transitions to `success` → resets after 3 s
- **Errors:** `401` wrong credentials → error toast | `[UNVERIFIED]` other errors
- **Trigger:** Password form submit (step=verify)
- **Source:** `ChangePasswordSection.tsx:62`

#### Get devices
- **Endpoint:** `GET /devices`
- **Request:** none
- **Success:** `200` → device list rendered
- **Errors:** `[UNVERIFIED]` — error toast
- **Trigger:** DeviceList mount (inside devices tab)
- **Source:** `DeviceList.tsx:31`

#### Logout single device
- **Endpoint:** `DELETE /devices/:sessionId`
- **Request:** none (sessionId in URL)
- **Success:** `200` → device removed from local list optimistically
- **Errors:** `[UNVERIFIED]` — error toast + device re-added
- **Trigger:** Per-device "Đăng xuất" button click
- **Source:** `DeviceList.tsx:45`

#### Logout all other devices
- **Endpoint:** `POST /devices/logout-all-others`
- **Request:** none
- **Success:** `200` → `{ devicesLoggedOut: number }` → success toast + all non-current devices removed
- **Errors:** `[UNVERIFIED]` — error toast
- **Trigger:** "Đăng xuất tất cả" button click
- **Source:** `DeviceList.tsx:58`

---

## Interaction Patterns

- **Clicking avatar or banner image zone in left card** — triggers hidden `<input type="file">` click — source: `ProfilePage.tsx:174,208`
- **Selecting a file** — immediately fires upload API, then calls `handleProfileUpdate` with the returned URL — source: `ProfilePage.tsx:92,108`
- **Tab switching** — sets `activeTab` state; different component mounts in R4; no data re-fetched (data loaded on mount per component) — source: `ProfilePage.tsx:322,334,346`
- **ProfileForm save disabled when no changes** — `hasChanges` computed from `name !== profile.name || bio !== profile.bio` — source: `ProfileForm.tsx:27`
- **Device icon selection** — derived from `deviceName`/`os` string matching for Smartphone/Tablet/Monitor — source: `DeviceList.tsx:68`
- **Optimistic pin toggle on flashcard** — local state updates immediately, API call in background, reverts on failure with toast — source: `MyMaterialsPage.tsx:449` (pattern referenced; not on this screen)

---

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | Tab bar buttons have no `aria-selected`; avatar/banner `<input>` are `class="hidden"` (visually concealed but not `aria-hidden`); file inputs lack `aria-label` |
| Keyboard navigation | supported | Tab key navigates all interactive elements; `onClick` on divs simulates button behavior (non-semantic) |
| Focus management | unmanaged | No explicit focus management on tab switch, modal open, or success reset |
| Screen reader compatibility | unknown | Semantic HTML used (`<button>`, `<label>`, `<p>`) but no `role="tablist"` on tab bar; no live regions for toast announcements |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

---

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `profile.isVerified === true` | auth | "Đã xác minh" green badge | "Chưa xác minh" warning badge | Consequence: no email verification warning in ProfileForm |
| `profile.isVerified === false` | auth | Warning banner + "Gửi email xác thực" button in ProfileForm | green badge | |
| `profile.banner` is truthy | responsive | Banner image | gradient background + upload prompt | |
| `profile.avatar` is truthy | responsive | Avatar image | initials fallback | |
| `profile.bio` is truthy | responsive | Bio italic text block | bio block not rendered | |
| `activeTab === "profile"` | auth | ProfileForm | ChangePasswordSection / DeviceList | |
| `activeTab === "security"` | auth | ChangePasswordSection | ProfileForm / DeviceList | |
| `activeTab === "devices"` | auth | DeviceList | ProfileForm / ChangePasswordSection | |
| `devices.length === 0` after load | auth | Empty state in DeviceList | device list items | |
| `currentDevice` exists | auth | Current device with coral highlight row | N/A | |
| `otherDevices.length > 0` | auth | "Đăng xuất tất cả" button | button not rendered | |

---

## Component Variants

| Component | Discriminating field | Variants on this screen | Screen-specific props/slots | Cross-ref |
|-----------|---------------------|------------------------|----------------------------|-----------|
| ProfileForm | N/A (single variant) | default | `profile`, `onSubmit`, `isSubmitting` | N/A |
| ChangePasswordSection | N/A (single variant) | step=initial / step=verify / step=success | none | N/A |
| DeviceList | N/A (single variant) | loading / populated / empty | none | N/A |

---

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `ProtectedRoute` wrapper on `/k/profile` route | auth | Redirect to `/login` if not authenticated |
| Device logout requires valid `sessionId` in URL | auth | `DELETE /devices/:sessionId` returns 404/403 for invalid session — server-enforced [UNVERIFIED] |

---

## Source References

- Page/View: `examio-fe/src/pages/k/ProfilePage.tsx:1`
- ProfileForm: `examio-fe/src/components/molecules/profile/ProfileForm.tsx:1`
- ChangePasswordSection: `examio-fe/src/components/molecules/profile/ChangePasswordSection.tsx:1`
- DeviceList: `examio-fe/src/components/molecules/profile/DeviceList.tsx:1`
- Profile API: `examio-fe/src/apis/profileApi.ts:1`
- Auth store: `examio-fe/src/stores/useAuthStore.ts:1`