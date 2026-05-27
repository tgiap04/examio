# Examio Full Specification Bundle

Generated: 2026-05-27T21:21:58.489406


---

# docs/features/f001-account-authentication-session-management/business-context.md

# F001 - Account Authentication & Session Management Business Context

This feature is the front door to Examio. It lets people create an account, sign in, stay signed in, recover access when they forget a password, and leave safely when they log out.

Users can start with email and password or choose Google sign-in. After they sign in, Examio keeps their session active so they can move through the workspace without repeatedly logging in. If their session expires, the app tries to renew it quietly before interrupting them.

The same account entry flows exist across web, Android, and iOS. Web is fully wired for the main auth flow. Android uses the shared mobile auth layer. iOS auth works through its own Swift client and Keychain storage because shared iOS token storage still needs verification.

Password recovery protects users who lose access to their accounts. The product sends a reset code, accepts the code with a new password, and returns the user to sign-in or another success path. The exact post-reset destination is not confirmed in the artifacts.

Successful registration also starts account setup behind the scenes, including wallet creation through backend finance integration.

## Artifact References
- `feature-list.md` F001
- `user-stories.md` US001-US003
- `screen-flow.md` FLW002-FLW006
- `permissions.md` PERM002-PERM008


---

# docs/features/f001-account-authentication-session-management/edge-cases.md

# F001 - Account Authentication & Session Management Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| Login credentials are invalid | Auth API rejects login; client keeps user on login screen | Invalid email or password. |
| Register email already exists | Register API rejects duplicate account | This email is already registered. |
| Session expires during workspace use | Axios tries refresh once, then retries original request | Session refreshed. |
| Refresh token/session is invalid | Client clears auth state and redirects to `/login` | Your session expired. Please sign in again. |
| OAuth callback lacks valid tokens | Client cannot persist auth and keeps/returns user to login | Google sign-in failed. Please try again. |
| Password reset code is invalid or expired | Reset password API rejects submission | The reset code is invalid or expired. |
| Network fails during auth request | Request fails without session change | Could not connect. Please try again. |
| Authenticated user opens `/login` or `/register` | PublicRoute redirects to `/k` | Not shown; automatic redirect. |

## Artifact References
- `behavior-logic.md` BL001-BL007
- `permissions.md` PERM002-PERM008
- Source paths: `examio-fe/src/apis/api.ts`, `examio-fe/src/stores/useAuthStore.ts`


---

# docs/features/f001-account-authentication-session-management/screens.md

# F001 - Account Authentication & Session Management Screens

## Screen List
- SCR008 `/login` - Login screen with credentials, Google OAuth, and Google One Tap support.
- SCR009 `/register` - Registration form.
- SCR010 `/forgot-password` - Password reset code request.
- SCR011 `/reset-password` - Code and new password submission.
- SCR012 `/k` - Authenticated workspace redirect target; exact destination Needs verification.
- SCR101-SCR105 - Android auth graph, login, register, forgot password, reset password.
- SCR201-SCR205 - iOS auth flow, login, register, forgot password, reset password.

## User Journey
1. Visitor opens login or register.
2. Visitor signs up with email/password or starts Google OAuth.
3. Backend authenticates the user, creates session credentials, and returns tokens/cookies.
4. Client persists auth state and sends user to `/k`.
5. Authenticated user revisits public auth pages and is redirected back to the workspace.
6. If an API call returns expired session, the client attempts refresh and retries once.
7. If refresh fails, local auth state is cleared and the user returns to `/login`.
8. For forgotten passwords, the user requests a reset code, submits the code and new password, then returns to the appropriate sign-in/success path. Exact redirect Needs verification.

## Artifact References
- `screen-list.md` SCR008-SCR012, SCR101-SCR105, SCR201-SCR205
- `screen-flow.md` FLW002-FLW006, FLW011-FLW012, FLW101-FLW104, FLW201-FLW204
- Source paths: web auth routes in `examio-fe/src/routes/index.tsx` Needs verification for exact route declarations.


---

# docs/features/f001-account-authentication-session-management/technical-spec.md

# F001 - Account Authentication & Session Management Technical Spec

## Functional Requirements
- FR001: The system shall let anonymous visitors register with email/password through `/api/v1/auth/register` and web/mobile register screens.
- FR002: The system shall let anonymous users log in with credentials through `/api/v1/auth/login`, issue access/refresh credentials, create a user session, and persist client auth state.
- FR003: The system shall support Google OAuth and Google One Tap through `/api/v1/auth/google`, `/api/v1/auth/google/callback`, and `/api/v1/auth/google/one-tap`.
- FR004: The system shall refresh sessions through `/api/v1/auth/refresh` or `/api/v1/auth/sync-refresh-token` when a valid refresh token/session is present.
- FR005: The system shall log out the current session through `/api/v1/auth/logout` and deactivate/clear local client auth state.
- FR006: The system shall support password recovery through send reset code and reset password routes.
- FR007: The system shall support authenticated password change through send change code and change password routes.

## Business Rules
- BR001: Anonymous users can register, log in, request password reset, and start OAuth flows.
- BR002: Authenticated users are redirected away from public auth screens to `/k`.
- BR003: Unauthenticated users attempting `/k/*` are redirected to `/login` and the return path is stored.
- BR004: New user registration triggers backend wallet bootstrap via finance integration/event flow.
- BR005: Backend accepts cookie-first JWT auth with Bearer token fallback.
- BR006: iOS KMP secure token storage is incomplete; iOS auth currently relies on Swift Keychain storage.

## State Machines
- SM001 Session state: anonymous -> authenticating -> authenticated -> refreshing -> authenticated, or refreshing -> expired -> anonymous.
- SM002 Password reset state: request code -> code sent -> submit code/new password -> reset complete -> login. Exact success redirect Needs verification.
- SM003 OAuth state: start provider redirect -> callback/deep link -> persist tokens -> strip URL params/open authenticated shell.

## Algorithms
- ALG001: Web Axios attaches `Authorization: Bearer {auth_token}` and `X-Device-ID` to requests.
- ALG002: On 401, web runs a single-flight refresh promise, retries the failed request once, then clears auth and redirects to `/login` if refresh fails.
- ALG003: OAuth callback parsing stores returned tokens and removes token query params from the URL.

## Integrations
- INT001: Gateway proxies `/api/v1/auth/*` to auth-service.
- INT002: Auth-service exposes gRPC token/user/permission validation for internal services.
- INT003: RabbitMQ `user.created` can initiate finance wallet creation.
- INT004: Web uses `src/apis/authApi.ts`, `src/stores/useAuthStore.ts`, `src/apis/api.ts`, `ProtectedRoute`, `PublicRoute`, and `useAuthSync`.
- INT005: Android uses shared KMP `AuthRepository`; iOS uses `AuthApiClient` plus `KeychainTokenStore`.

## Key Entities
- MODEL001 `User`
- MODEL002 `UserSession`
- MODEL004 `ResetPasswordCode`
- MODEL031 `auth.proto`
- MODEL036 user events

## Artifact References
- `feature-list.md` F001
- `user-stories.md` US001-US003
- `screen-list.md` SCR008-SCR011, SCR101-SCR105, SCR201-SCR205
- `screen-flow.md` FLW002-FLW006, FLW011-FLW012, FLW101-FLW104, FLW201-FLW204
- `behavior-logic.md` BL001-BL011, BL020-BL024, BL060
- `api-map.md` API001, API018
- `permissions.md` PERM002-PERM008
- Source paths: `examio-fe/src/apis/authApi.ts`, `examio-fe/src/stores/useAuthStore.ts`, `examio-fe/src/apis/api.ts`; backend/mobile exact file paths Needs verification beyond artifact names.


---

# docs/features/f002-account-verification-profile-security/business-context.md

# F002 - Account Verification & Profile Security Business Context

This feature helps users trust and control their accounts after they sign in. It covers email verification, profile personalization, profile media, and device/session security.

Verification gives Examio a way to distinguish confirmed accounts from accounts that have not proven ownership of their email address. The workspace can guide users to verify when needed.

Profile management lets users keep their name, avatar, banner, and other personal details up to date. Media uploads are backed by the storage service, so profile images can be reused consistently across clients.

Device management helps users see where they are signed in and remove sessions they no longer trust. This is important when a user signs in from a shared or lost device.

Mobile account screens exist, but the artifacts say most non-auth mobile account details are still mock-backed or need wiring verification.

## Artifact References
- `feature-list.md` F002
- `user-stories.md` US004, US015
- `permissions.md` PERM009-PERM011


---

# docs/features/f002-account-verification-profile-security/edge-cases.md

# F002 - Account Verification & Profile Security Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| Verification code is invalid or expired | Verify API rejects code; account remains unverified | Verification code is invalid or expired. |
| User requests verification too often | API may rate limit or reject repeated sends; exact behavior Needs verification | Please wait before requesting another code. |
| Profile update validation fails | Profile API rejects invalid fields | Please check your profile details. |
| Avatar/banner upload fails | R2/media API fails; existing profile media remains unchanged | Upload failed. Please try again. |
| Device logout targets current session | Session may end and client should return to login; exact UX Needs verification | You have been signed out. |
| Device list cannot load | UI should show recoverable error and keep profile usable | Could not load active devices. |
| Session expires while editing profile | Auth refresh runs; on failure user returns to login | Your session expired. Please sign in again. |
| Mobile profile screen action is not wired | Platform UI may show local/mock state only | This feature is not available yet. Needs verification. |

## Artifact References
- `behavior-logic.md` BL009, BL057, BL070-BL072
- `permissions.md` PERM009-PERM011, PERM038, PERM040
- `api-map.md` API002, API012


---

# docs/features/f002-account-verification-profile-security/screens.md

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


---

# docs/features/f002-account-verification-profile-security/technical-spec.md

# F002 - Account Verification & Profile Security Technical Spec

## Functional Requirements
- FR001: The system shall let authenticated users request a verification email/code through `/api/v1/auth/sendVerificationEmail`.
- FR002: The system shall let authenticated users submit verification through `/api/v1/auth/verifyAccount` and update account verification state.
- FR003: The system shall display account verification access from `/k/verify` and workspace verification notices.
- FR004: The system shall let authenticated users view and update their own profile details through profile APIs.
- FR005: The system shall let authenticated users upload avatar and banner media through R2-backed image upload routes.
- FR006: The system shall let authenticated users view and manage their own active devices/sessions.
- FR007: The system shall let authenticated users change password through authenticated password-change routes.

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
- Source paths: `examio-fe/src/apis/profileApi.ts`, `examio-fe/src/apis/devicesApi.ts`, `examio-fe/src/apis/mediaApi.ts`; backend route file paths Need verification.


---

# docs/features/f003-workspace-navigation-dashboard-material-access/business-context.md

# F003 - Workspace Navigation, Dashboard & Material Access Business Context

This feature is the learner's main workspace after sign-in. It gives users a protected place to continue studying, find recent materials, review history, and move between the major Examio tools.

The workspace shell is more than navigation. It holds shared workspace UI such as the sidebar, header, search, theme controls, verification reminders, and pending job information.

My Materials helps users quickly return to recent or pinned study content instead of searching through every quiz or flashcard set. History helps users understand what they have done recently, including exams and uploaded/generated PDF activity.

Web is the reliable production-backed experience for this feature. Mobile screens show similar areas, but the artifacts say most mobile non-auth screens still use mock state even though shared API repositories exist.

## Artifact References
- `feature-list.md` F003
- `user-stories.md` US005, US010, US019
- `screen-flow.md` FLW010-FLW012, FLW023, FLW053


---

# docs/features/f003-workspace-navigation-dashboard-material-access/edge-cases.md

# F003 - Workspace Navigation, Dashboard & Material Access Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| Unauthenticated user opens `/k/my-materials` | ProtectedRoute stores target and redirects to login | Please sign in to continue. |
| `/k` root destination is ambiguous | App redirects according to current route config; exact target Needs verification | Not shown; automatic redirect. |
| Materials list is empty | Screen shows empty state instead of failing | No materials yet. |
| Student materials API route differs from client expectation | Request fails until route contract is verified | Could not load materials. |
| Pin/unpin/share action fails | Store should keep or restore previous state | Could not update this material. |
| History stats fail to load | History page shows recoverable error/empty state | Could not load history. |
| Session expires while loading workspace data | Axios refreshes once or redirects to login | Your session expired. Please sign in again. |
| Mobile tab shows mock data | UI does not reflect backend data until wired | Needs verification; avoid user-facing production claim. |

## Artifact References
- `behavior-logic.md` BL004-BL006, BL032-BL033, BL053, BL070-BL072
- `api-map.md` API009, API010
- `permissions.md` PERM008, PERM022, PERM040


---

# docs/features/f003-workspace-navigation-dashboard-material-access/screens.md

# F003 - Workspace Navigation, Dashboard & Material Access Screens

## Screen List
- SCR012 `/k` - Workspace root redirect; exact destination Needs verification.
- REG003 KLayout - Authenticated shell with sidebar/header/search/theme/verification banner/pending job dialog.
- SCR016 `/k/my-materials` - Recent student materials.
- SCR018 `/k/history` - History overview.
- SCR019 `/k/history/exam` - Exam history.
- SCR020 `/k/history/pdf` - PDF/upload/generation history.
- SCR107 Android HomeScreen - Mock-backed, unused in main tab selection.
- SCR112 Android StudyScreen - Mock-backed materials/study UI.
- SCR113 Android LichSuScreen - Mock-backed history UI.
- SCR207 iOS HomeView - Mock-backed dashboard/default stats.
- SCR209 iOS StudyView - Mock-backed material/study UI.

## User Journey
1. Authenticated user lands on `/k`; the app resolves the workspace destination. Exact route Needs verification.
2. KLayout renders shared navigation and workspace utilities.
3. User opens My Materials to see recent exams/flashcards and pinned/shared content.
4. User selects a material to continue study, open flashcard study, or reach an exam-related destination. Exact navigation from materials Needs verification.
5. User opens History to review summary stats and recent activity.
6. User branches into exam history or PDF history for focused lists.
7. On mobile, user can navigate similar tabs, but displayed data is mostly mock-backed outside auth.

## Artifact References
- `screen-list.md` SCR012, SCR016, SCR018-SCR020, REG003, SCR107, SCR112-SCR113, SCR207, SCR209
- `screen-flow.md` FLW010-FLW012, FLW023, FLW041, FLW053, FLW105, FLW108, FLW205


---

# docs/features/f003-workspace-navigation-dashboard-material-access/technical-spec.md

# F003 - Workspace Navigation, Dashboard & Material Access Technical Spec

## Functional Requirements
- FR001: The system shall protect `/k/*` workspace routes from unauthenticated web users.
- FR002: The system shall provide an authenticated workspace shell with sidebar/header/search/theme controls and verification banner support.
- FR003: The system shall route authenticated users from `/k` to the workspace destination. Exact destination Needs verification.
- FR004: The system shall show recent student materials through `/k/my-materials` using student materials APIs.
- FR005: The system shall support pin/unpin/share access for student materials where exposed by the student materials API. Exact backend route list Needs verification.
- FR006: The system shall show history overview, exam history, and PDF/upload/generation history through history routes.
- FR007: The system shall cache API-backed material/history data in frontend stores and invalidate on create/update/delete mutations.
- FR008: Mobile home/history/study tabs shall represent the workspace concept, but non-auth mobile feature screens are currently mostly mock-backed.

## Business Rules
- BR001: Workspace access requires authentication.
- BR002: Student material views are scoped to the authenticated user and accessible materials.
- BR003: Pinned/shared material behavior must respect backend ownership/access rules; exact sharing rules Need verification.
- BR004: Mobile non-auth feature UIs must not be treated as production API-backed behavior until repository wiring is verified.

## State Machines
- SM001 Workspace route state: unauthenticated -> redirect to login with return path; authenticated -> render KLayout and target screen.
- SM002 Material cache state: empty -> loading -> loaded -> stale after mutation -> revalidated.
- SM003 History view state: overview -> exam history or PDF history -> detail if available. Exact detail routes Need verification.

## Algorithms
- ALG001: ProtectedRoute stores intended destination before redirecting unauthenticated users to `/login`.
- ALG002: Zustand store cache reduces repeated API calls during a session and invalidates when user mutates data.
- ALG003: Axios refresh logic handles expired sessions for material/history API requests.

## Integrations
- INT001: Web workspace routes use KLayout and route guards.
- INT002: Student materials use `/api/v1/student/*` and `studentMaterialsApi.ts`.
- INT003: History uses `/api/v1/examattempts/*` and `/api/v1/ai/*` via `historyApi.ts` and stats store.
- INT004: Recent uploads/history can read AI upload/generation endpoints.
- INT005: Mobile shared KMP repositories exist for history/student materials, but platform UIs are mostly mock-backed.

## Key Entities
- MODEL010 `QuizSet`
- MODEL014/MODEL015 `FlashCardSet` naming discrepancy Needs verification in artifacts
- MODEL018/MODEL020 `ExamAttempt` naming discrepancy Needs verification in artifacts
- MODEL024/MODEL027 `UserStorage` naming discrepancy Needs verification in artifacts
- MODEL021/MODEL025 `HistoryGeneratedQuizz` naming discrepancy Needs verification in artifacts
- MODEL022/MODEL026 `HistoryGeneratedFlashcard` naming discrepancy Needs verification in artifacts

## Artifact References
- `feature-list.md` F003
- `user-stories.md` US005, US010, US019
- `screen-list.md` SCR012, SCR016, SCR018-SCR020, SCR107, SCR112-SCR113, SCR207, SCR209
- `screen-flow.md` FLW010-FLW012, FLW023, FLW041, FLW053, FLW105, FLW108, FLW205-FLW206
- `behavior-logic.md` BL003-BL006, BL030-BL033, BL053, BL070-BL073
- `api-map.md` API006, API009, API010
- `permissions.md` PERM008, PERM022, PERM031, PERM040
- Source paths: `examio-fe/src/apis/studentMaterialsApi.ts`, `examio-fe/src/apis/historyApi.ts`, related Zustand stores; exact screen files Need verification.


---

# docs/features/f004-quiz-set-authoring-practice-content/business-context.md

# F004 - Quiz Set Authoring & Practice Content Business Context

This feature lets users build reusable quiz content. A quiz set can hold questions, labels, sharing settings, and generated content that later supports practice or exam workflows.

For learners, quiz sets are study material. For teachers, quiz sets can become the foundation for exam rooms and sessions. The artifacts imply teacher-style workflows, but exact role enforcement is not confirmed.

Users can create quiz sets manually or reuse quizzes generated from uploaded files. This connects authoring with the AI generation feature: generated quiz output should become something the user can save, review, and reuse instead of being a one-time result.

Web is wired to the real quiz set APIs and store. Mobile has shared API services for quiz sets, but the visible Android/iOS quiz and teacher screens are described as mock-backed.

## Artifact References
- `feature-list.md` F004
- `user-stories.md` US006, US008
- `behavior-logic.md` BL030, BL052
- `permissions.md` PERM015-PERM017, PERM030


---

# docs/features/f004-quiz-set-authoring-practice-content/edge-cases.md

# F004 - Quiz Set Authoring & Practice Content Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| User creates quiz set with invalid fields | Quiz set API rejects validation | Please check the quiz set details. |
| User opens a quiz set they cannot access | Backend denies or returns not found | You do not have access to this quiz set. |
| Owner deletes a quiz set used elsewhere | Delete behavior/cascade rules Need verification | Could not delete this quiz set. Needs verification. |
| Question save fails | Detail screen should keep unsaved data visible and show error | Could not save the question. |
| Label assignment fails | Existing question/label state remains or is restored | Could not update the label. |
| Generated quiz history cannot be saved | Generation result should remain visible if possible | Could not save generated quiz. |
| Public/shared access rule is ambiguous | Client should defer to backend response | Access rules need verification. |
| Mobile quiz management action is used | UI may only update mock local state | This mobile action is not connected yet. Needs verification. |

## Artifact References
- `behavior-logic.md` BL030, BL032, BL052
- `api-map.md` API003, API006, API010, API011
- `permissions.md` PERM015-PERM017, PERM030, PERM040


---

# docs/features/f004-quiz-set-authoring-practice-content/screens.md

# F004 - Quiz Set Authoring & Practice Content Screens

## Screen List
- SCR021 `/k/manage-exam` - Manage Exams / Quiz Sets list and CRUD entry.
- SCR022 `/k/manage-quiz-set/:id` - Quiz set detail with questions, labels, editor, and export.
- SCR024 `/k/ai-tool` - Generates quiz content from uploaded files; supports generated quiz history/result flow.
- SCR016 `/k/my-materials` - Can surface quiz/exam materials for student access.
- SCR111 Android DeThiScreen - Mock-backed exam set management/stats/create UI.
- SCR116 Android TeacherScreen - Mock-backed content management UI.
- SCR212 iOS TeacherView - Mock-backed teacher content management.

## User Journey
1. User opens Manage Exams / Quiz Sets.
2. User creates a quiz set or opens an existing one.
3. User edits title/metadata, adds questions, and organizes labels.
4. User saves changes; store cache invalidates so lists/details reload fresh data.
5. User may share/export/use the quiz set in later practice or exam workflows. Exact sharing/export behavior Needs verification.
6. User may generate quiz content from a file in AI Tool, then save/reuse it as quiz content. Exact conversion flow Needs verification.
7. Mobile users see similar quiz/teacher screens, but these are mock-backed unless repository wiring is verified.

## Artifact References
- `screen-list.md` SCR016, SCR021-SCR022, SCR024, SCR111, SCR116, SCR212
- `screen-flow.md` FLW020, FLW023, FLW040, FLW105, FLW108, FLW206


---

# docs/features/f004-quiz-set-authoring-practice-content/technical-spec.md

# F004 - Quiz Set Authoring & Practice Content Technical Spec

## Functional Requirements
- FR001: The system shall let authenticated users create quiz sets through `/api/v1/quizsets`.
- FR002: The system shall let users list, view, update, and delete accessible quiz sets.
- FR003: The system shall let owners manage questions within a quiz set through quiz set question routes.
- FR004: The system shall let owners assign/manage quiz set labels.
- FR005: The system shall support sharing/access rules for public, owned, or shared quiz sets where exposed by the backend. Exact public/shared rules Need verification.
- FR006: The system shall save generated quiz content/history from AI generation flows for later reuse.
- FR007: The system shall expose quiz set material to student material and exam/practice workflows.
- FR008: Mobile quiz/teacher screens shall represent quiz set management, but platform UI is mock-backed while shared KMP quiz APIs exist.

## Business Rules
- BR001: Authenticated users can create quiz sets and become the owner/manager.
- BR002: Owners can edit/delete their quiz sets, questions, and labels.
- BR003: Public/shared quiz visibility exists in model/API descriptions, but exact access rules Need verification.
- BR004: Generated quiz content must be saved against the appropriate user/upload/history record before reuse.
- BR005: Teacher-only expectations around quiz/exam authoring are implied by screens, but web TeacherRoute does not enforce teacher/admin role.

## State Machines
- SM001 Quiz set lifecycle: draft/created -> questions/labels edited -> published/shared or kept private -> updated/deleted. Exact status fields Need verification.
- SM002 Question lifecycle: added -> edited/labeled -> removed.
- SM003 Generated quiz lifecycle: file processed -> generated quiz returned -> saved to history -> converted/reused as quiz content. Exact conversion route Needs verification.

## Algorithms
- ALG001: Store cache should avoid repeated quiz set API calls and invalidate after create/update/delete/question mutations.
- ALG002: Export/editor behavior exists on web for quiz set detail, but exact export algorithm Needs verification.

## Integrations
- INT001: Gateway proxies `/api/v1/quizsets/*` to exam-service quiz set functionality.
- INT002: Web uses `quizsetApi.ts` and `useQuizSetStore`.
- INT003: Generated quiz history uses AI generation endpoints and Python generation routes indirectly through exam-service.
- INT004: Student materials can surface quiz/exam content through `/api/v1/student/*`.
- INT005: Exam room/session flows can use quiz sets as source content.
- INT006: Mobile shared KMP `QuizSetApiService` exists; mobile De Thi/teacher screens are mock-backed.

## Key Entities
- MODEL010 `QuizSet`
- MODEL011 `QuizSetLabel`
- MODEL012 `QuizQuestion`
- MODEL013 `DetailsQuizQuestion`
- MODEL014 `QuizPracticeAttempt` from `data-model.md`; feature-list uses MODEL013 for DetailsQuizQuestion and MODEL021 for HistoryGeneratedQuizz, which conflicts with data-model numbering. Needs verification.
- MODEL025 `HistoryGeneratedQuizz` per `data-model.md`; feature-list says MODEL021. Needs verification.

## Artifact References
- `feature-list.md` F004
- `user-stories.md` US006, US008
- `screen-list.md` SCR021-SCR022, SCR111, SCR116, SCR212
- `screen-flow.md` FLW020, FLW040, FLW105, FLW108, FLW206
- `behavior-logic.md` BL030, BL032, BL052, BL070-BL072
- `api-map.md` API003, API010, API006, API011
- `permissions.md` PERM015-PERM017, PERM030, PERM040
- Source paths: `examio-fe/src/apis/quizsetApi.ts`, `examio-fe/src/stores/useQuizSetStore.ts`; exact backend module/controller paths Need verification.


---

# docs/features/f005-flashcard-authoring-study/business-context.md

# F005 Business Context - Flashcard Authoring & Study

Flashcards help learners turn study material into short question-and-answer cards for repeated recall. A learner or teacher can create a set, add cards, organize them with labels, and return later to study.

The value of this feature is fast repetition: users should be able to resume a set from their materials, move through cards, and keep progress without rebuilding the same content.

Sharing is part of the expected workflow. A user may need to give another learner access to a set, but the exact public/shared/access-code behavior still needs verification from backend rules.

On web, this feature is treated as production-wired. On mobile, flashcard screens exist and shared API code exists, but the visible Android/iOS feature screens are currently described as mock-backed, so full mobile product behavior needs verification before release claims.

Artifact refs: `feature-list.md` F005, `user-stories.md` US007, `behavior-logic.md` BL031-BL034, `permissions.md` PERM018-PERM021.


---

# docs/features/f005-flashcard-authoring-study/edge-cases.md

# F005 Edge Cases - Flashcard Authoring & Study

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| User is not signed in and opens `/k/flash-card` | ProtectedRoute redirects to login and stores return target. | Please sign in to continue. |
| User opens `/study-flashcard/:id` without access | API rejects loading the set. | You do not have access to this flashcard set. |
| Flashcard set was deleted while user is studying | Next load/progress call fails; study should stop. | This flashcard set is no longer available. |
| Set has no cards | Study cannot begin until cards exist. | Add flashcards before starting study. |
| Progress submission fails | Keep current local state and allow retry. | Could not save your progress. Try again. |
| Shared/public access rule is ambiguous | Treat as Needs verification; do not expose private cards without backend approval. | Access to this set could not be verified. |
| Mobile user opens study screen | Current platform UI may use mock state, not real repository calls. | Needs verification. |


---

# docs/features/f005-flashcard-authoring-study/screens.md

# F005 Screens - Flashcard Authoring & Study

## Screen List
- SCR017 `/k/flash-card` - browse/search/create flashcard sets.
- SCR023 `/k/manage-flashcard-set/:id` - edit a set, cards, labels, and sharing.
- SCR030 `/study-flashcard/:id` - standalone flashcard study flow; no web route guard, API access required.
- SCR016 `/k/my-materials` - recent materials can link to flashcard study.
- SCR112 Android StudyScreen - mock-backed study/material list.
- SCR209 iOS StudyView - mock-backed material list and flashcard study.

## User Journey
1. User opens the workspace flashcard page.
2. User creates or selects a flashcard set.
3. User edits title/tags/cards/labels and sharing settings where permitted.
4. User starts study from the set, My Materials, or a shared link.
5. The study screen loads accessible cards and submits progress/answers.
6. User returns to materials/history with updated progress where supported; exact history display Needs verification.

Artifact refs: `screen-list.md` SCR016, SCR017, SCR023, SCR030, SCR112, SCR209; `screen-flow.md` FLW021-FLW023.


---

# docs/features/f005-flashcard-authoring-study/technical-spec.md

# F005 Technical Spec - Flashcard Authoring & Study

## Functional Requirements
- FR001: Authenticated users can create, list, search, view, update, and delete flashcard sets they own or can access.
- FR002: Users can add, edit, delete, and organize flashcards inside a flashcard set.
- FR003: Users can manage labels/tags and sharing/access settings for flashcard sets where ownership permits.
- FR004: Users can start a flashcard study flow for an accessible set from web `/study-flashcard/:id` or workspace entry points.
- FR005: Study flow records progress and answer submissions through the flashcard study API.
- FR006: Student material surfaces can show recent/pinned/shared flashcard sets where available.
- FR007: Mobile flashcard/study screens are represented in Android/iOS UI, but current platform feature screens are mock-backed; API wiring Needs verification.

## Business Rules
- BR001: Creating or managing flashcard sets requires authentication. Source: PERM019, PERM020.
- BR002: Viewing/studying a set requires ownership, public/shared access, or valid access code where supported. Exact public/share rules Need verification. Source: PERM018, PERM021.
- BR003: Mutations must invalidate cached flashcard/student-material data so stale sets are not reused. Source: BL032.
- BR004: Standalone study route has no web route guard; backend/API access checks are required. Source: FLW022, SCR030.

## State Management
- SM001: Web uses `useFlashcardSetStore` and `flashcardSetApi.ts` for set/card state.
- SM002: Web uses `flashcardStudyApi.ts` for progress and answer submissions.
- SM003: Store cache is reused for reads and invalidated after create/update/delete operations. Source: BL032.
- SM004: Mobile shared `FlashcardRepository`/`FlashcardApiService` exists; Android/iOS screens are mock-backed. Source: SCR112, SCR209, BL070-BL072.

## Algorithms
- ALG001: Study session loads an accessible flashcard set, presents cards, accepts recall/answer actions, posts progress, then posts answer result per card.
- ALG002: Set access resolution should check owner/shared/public/access-code rules before exposing card contents. Exact precedence Needs verification.

## Integrations
- INT001: API004 `/api/v1/flashcardsets/*` for set/card/label CRUD.
- INT002: API004 `/api/v1/flashcard-study/*` for progress and answer submission.
- INT003: API010 `/api/v1/student/*` for recent/pinned material access where flashcards appear.

## Key Entities
- MODEL015 `FlashCardSet`
- MODEL016 `FlashCard`
- MODEL017 `DetailsFlashCard`
- MODEL053 mobile `FlashcardModels.kt`

## Artifact References
- `feature-list.md` F005
- `user-stories.md` US007
- `screen-list.md` SCR017, SCR023, SCR030, SCR112, SCR209
- `screen-flow.md` FLW021, FLW022, FLW023
- `behavior-logic.md` BL031, BL032, BL033, BL034
- `api-map.md` API004, API010
- `permissions.md` PERM018-PERM022
- Source paths: web `src/apis/flashcardSetApi.ts`, `src/apis/flashcardStudyApi.ts`, `src/stores/useFlashcardSetStore.ts`; mobile KMP `FlashcardApiService`, `FlashcardRepository`; exact file locations Need verification.


---

# docs/features/f006-ai-file-upload-ocr-content-generation/business-context.md

# F006 Business Context - AI File Upload, OCR & Content Generation

This feature lets a learner turn a file, such as a PDF or image, into useful study content. Instead of manually typing questions or flashcards, the user uploads material and asks Examio to generate learning assets from it.

The flow matters because users often arrive with existing lecture notes, documents, or screenshots. The product should store the file, process the content, and show progress while generation is running.

A successful result can become a quiz set or flashcard set, and the user should be able to find recent uploads and generated history later.

Some behavior still needs verification: exact upload limits, production credit rules, and whether mobile screens are connected to real APIs.

Artifact refs: `feature-list.md` F006, `user-stories.md` US008, `behavior-logic.md` BL050-BL053, `permissions.md` PERM029-PERM031.


---

# docs/features/f006-ai-file-upload-ocr-content-generation/edge-cases.md

# F006 Edge Cases - AI File Upload, OCR & Content Generation

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| User is not signed in | Workspace route/API blocks upload. | Please sign in to upload files. |
| File is too large | Client/backend should reject before processing; exact backend limit Needs verification. | File is too large to upload. |
| Unsupported file type | Upload or processing is rejected. | This file type is not supported. |
| R2 upload succeeds but DB record fails | System should not expose orphaned file; cleanup behavior Needs verification. | Upload could not be saved. Try again. |
| OCR/processing fails | `UserStorage.processingStatus` should show failure. | We could not process this file. |
| Generation job times out | Polling stops and user can retry/delete job. | Generation is taking too long. Try again later. |
| User lacks credits/subscription | Backend should reject generation if enforced; Needs verification. | You do not have enough credits for this action. |
| Mobile user generates content | UI may be mock-backed rather than API-backed. | Needs verification. |


---

# docs/features/f006-ai-file-upload-ocr-content-generation/screens.md

# F006 Screens - AI File Upload, OCR & Content Generation

## Screen List
- SCR024 `/k/ai-tool` - upload, generation, recent files, job polling.
- SCR020 `/k/history/pdf` - upload/generation history.
- SCR018 `/k/history` - history overview entry point.
- SCR108 Android AiScreen - mock-backed AI sections.
- SCR109 Android AIToolScreen - mock-backed PDF upload/generation UI.
- SCR208 iOS AiView - mock-backed teacher/chat/tool/history segmented UI.

## User Journey
1. User opens AI Tool.
2. User uploads a file or image.
3. System stores the file and starts processing.
4. User waits while status/job polling updates the UI.
5. User chooses quiz or flashcard generation from the processed file.
6. Generated content is shown and saved to history where supported.
7. User revisits recent uploads or PDF/generation history.

Artifact refs: `screen-list.md` SCR018, SCR020, SCR024, SCR108, SCR109, SCR208; `screen-flow.md` FLW040-FLW041.


---

# docs/features/f006-ai-file-upload-ocr-content-generation/technical-spec.md

# F006 Technical Spec - AI File Upload, OCR & Content Generation

## Functional Requirements
- FR001: Authenticated users can upload supported files/images from `/k/ai-tool`.
- FR002: Uploaded files are stored through R2 and persisted as `UserStorage` records.
- FR003: The system processes files through OCR/chunking/embedding pipelines and updates processing status.
- FR004: Users can generate quizzes or flashcards from processed file content.
- FR005: Generation creates async job/history records and supports job polling/cancel/delete where available.
- FR006: Users can view recent uploads and generation history.
- FR007: Mobile AI upload/generation screens exist but are mock-backed; shared API wiring Needs verification.

## Business Rules
- BR001: Upload and generation require authentication. Source: PERM029, PERM030.
- BR002: Users may view/delete/regenerate only own uploads/jobs/history. Source: PERM031.
- BR003: Client notes a 50MB upload limit; backend/R2 exact limits Need verification. Source: PERM029.
- BR004: Web `FREE_MODE = true` bypasses client credit checks; backend subscription/credit enforcement Needs verification. Source: BL065.
- BR005: R2 asset deletion must be coordinated with DB record deletion; exact implementation Needs verification.

## State Management
- SM001: Web `useAIGeneratorStore` tracks upload, selected files, generation jobs, polling, credits, and recent uploads.
- SM002: Web `aiApi.ts`, `examApi.ts`, and `historyApi.ts` call gateway endpoints.
- SM003: AI model catalog is lazy-loaded and cached. Source: BL055.
- SM004: Mobile shared `AIGeneratorApiService` exists; Android/iOS screens are mock-backed.

## Algorithms
- ALG001: Upload flow: client -> gateway -> exam-service -> R2 gRPC -> `UserStorage` -> Python `process-file`.
- ALG002: Processing flow: OCR extracts text, chunks content, creates embeddings/documents, and updates file status.
- ALG003: Generation flow: selected upload + generation settings -> async job -> poll `/ai/job/:jobId` -> display/save quiz or flashcards.

## Integrations
- INT001: API006 `/api/v1/ai/*` for upload, generation, models, recent uploads, jobs, history.
- INT002: API011 Python `/api/ai/*` and `/api/generate/*` for processing and generation.
- INT003: API012 R2 gRPC for storage.
- INT004: API013 OCR service/gRPC for PDF OCR.
- INT005: API018 RabbitMQ OCR events may be involved; exact async topology Needs verification.

## Key Entities
- MODEL025 `HistoryGeneratedQuizz`
- MODEL026 `HistoryGeneratedFlashcard`
- MODEL027 `UserStorage`
- MODEL028 `Document`
- MODEL034 `r2.proto`
- MODEL035 `ocr.proto`
- MODEL039 OCR events

## Artifact References
- `feature-list.md` F006
- `user-stories.md` US008
- `screen-list.md` SCR024, SCR108, SCR109, SCR208
- `screen-flow.md` FLW040, FLW041, FLW107, FLW206
- `behavior-logic.md` BL050-BL053, BL055, BL065
- `api-map.md` API006, API011, API012, API013, API018
- `permissions.md` PERM029-PERM031, PERM038-PERM039
- Source paths: web `src/apis/aiApi.ts`, `src/apis/examApi.ts`, `src/apis/historyApi.ts`, `src/stores/useAIGeneratorStore.ts`; backend exam-service AI modules, R2 service, Python AI service; exact files Need verification.


---

# docs/features/f007-ai-chat-virtual-tutor/business-context.md

# F007 Business Context - AI Chat & Virtual Tutor

The virtual tutor gives learners a conversational way to ask questions, review material, and get explanations tied to subjects or uploaded documents.

For learners, the key promise is contextual help: they can ask about a topic, include a document, and receive a guided answer without leaving the study workspace.

For teachers or administrators, the knowledge management area is intended to keep the tutor's source material organized. That includes folders, files, dataset imports, and graph-like views, but the exact permission model still needs verification.

Web streaming is the main complete experience. Mobile chat screens exist, but streaming support is not implemented according to the current artifacts.

Artifact refs: `feature-list.md` F007, `user-stories.md` US009 and US018, `behavior-logic.md` BL054-BL056, `permissions.md` PERM032-PERM036.


---

# docs/features/f007-ai-chat-virtual-tutor/edge-cases.md

# F007 Edge Cases - AI Chat & Virtual Tutor

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| User is not signed in | Workspace/API blocks chat. | Please sign in to use AI tutor. |
| SSE stream disconnects | Preserve sent user message and show retry state. | Connection lost. Try sending again. |
| Mobile starts streaming chat | Platform SSE actuals are stubbed. | AI streaming is not available on this device yet. |
| Attached document is not processed | Chat should reject or warn before sending context. | This document is not ready yet. |
| User attaches a document they do not own | Backend should reject access. | You do not have access to this document. |
| Subject list fails to load | Chat can continue without subject if allowed. | Subjects could not be loaded. |
| Knowledge user lacks permission | GenAI knowledge action is blocked. | You do not have permission to manage tutor knowledge. |
| Python AI service is unavailable | Chat/generation fails gracefully. | AI tutor is temporarily unavailable. |


---

# docs/features/f007-ai-chat-virtual-tutor/screens.md

# F007 Screens - AI Chat & Virtual Tutor

## Screen List
- SCR024 `/k/ai-tool` - AI tutor/chat entry and document-aware AI tools.
- SCR025 `/k/genai-knowledge` - tutor knowledge folders/files/datasets/graphs; access rules Need verification.
- SCR108 Android AiScreen - mock-backed teacher chat/tool/history sections.
- SCR208 iOS AiView - mock-backed teacher/chat/tool/history segmented view.

## User Journey
1. User opens AI Tool.
2. User selects or creates a chat session.
3. User chooses subject/model context where available.
4. User optionally attaches images or processed documents.
5. User sends a message.
6. Web receives a streamed tutor response and persists the conversation.
7. Teacher/admin users manage knowledge sources in GenAI Knowledge if authorized; exact authorization Needs verification.

Artifact refs: `screen-list.md` SCR024, SCR025, SCR108, SCR208; `screen-flow.md` FLW042-FLW043.


---

# docs/features/f007-ai-chat-virtual-tutor/technical-spec.md

# F007 Technical Spec - AI Chat & Virtual Tutor

## Functional Requirements
- FR001: Authenticated users can create/open AI chat sessions.
- FR002: Users can send messages and receive streamed tutor responses on web.
- FR003: Users can select subjects/model context where available.
- FR004: Users can attach uploaded documents or images to provide context.
- FR005: Chat messages are persisted with role/content/image/document references.
- FR006: Teachers/admins can manage GenAI tutor knowledge files/folders/datasets/graphs from `/k/genai-knowledge`; authorization Needs verification.
- FR007: Mobile AI chat UI exists, but SSE clients are stubbed and feature screens are mock-backed.

## Business Rules
- BR001: AI chat requires authentication. Source: PERM032.
- BR002: Chat image/document uploads require authenticated ownership/access. Source: PERM033.
- BR003: Subject list is public according to permissions. Source: PERM036.
- BR004: Tutor knowledge management is admin/teacher-like but exact allowed-email/admin backend rule Needs verification. Source: PERM034, PERM035.
- BR005: Subscription checks may apply through finance benefits; exact product limits Need verification. Source: BL064.

## State Management
- SM001: Web `useAITeacherStore` manages chat sessions/messages/streaming state.
- SM002: Web `aiChatApi.ts` handles chat CRUD/message/SSE calls.
- SM003: Subject/model catalogs are loaded through subject/model APIs and cached/lazy-loaded.
- SM004: Mobile shared `AIChatRepository` exists but Android/iOS SSE actuals throw `NotImplementedError`.

## Algorithms
- ALG001: Streaming chat sends message/context to gateway/exam-service/Python and appends SSE chunks until completion.
- ALG002: Multi-document chat resolves selected `UserStorage` records, links them through `AIChatDocument`, and sends relevant context to Python AI service.
- ALG003: Knowledge ingestion imports/uploads files, processes them, and exposes graph/stat views; exact graph persistence Needs verification.

## Integrations
- INT001: API007 `/ai-chat/*` and Python `/api/chat/*` for chat and streaming.
- INT002: API008 `/subjects` and `/ai/models` for subject/model catalog.
- INT003: API011 Python AI processing for document context and RAG.
- INT004: API014 `/api/v1/ai/tutor/*` and Python `/api/tutor/*` for tutor knowledge management.
- INT005: API012 R2 may store chat images/documents.

## Key Entities
- MODEL022 `AIChat`
- MODEL023 `AIChatMessage`
- MODEL024 `AIChatDocument`
- MODEL027 `UserStorage`
- MODEL028 `Document`
- MODEL050 mobile `AIChatModels.kt`
- Subject/category models Need verification.

## Artifact References
- `feature-list.md` F007
- `user-stories.md` US009, US018
- `screen-list.md` SCR024, SCR025, SCR108, SCR208
- `screen-flow.md` FLW042, FLW043, FLW107, FLW206
- `behavior-logic.md` BL054-BL056, BL064, BL074
- `api-map.md` API007, API008, API011, API014
- `permissions.md` PERM032-PERM036
- Source paths: web `src/apis/aiChatApi.ts`, `src/apis/subjectApi.ts`, `src/apis/genaiTutorKnowledgeApi.ts`, `src/stores/useAITeacherStore.ts`, `src/stores/useGenAIKnowledgeStore.ts`; Python AI chat/tutor APIs; exact backend files Need verification.


---

# docs/features/f008-exam-room-session-management/business-context.md

# F008 Business Context - Exam Room & Session Management

Exam rooms let a teacher or host organize assessments. A room groups the exam setup, while sessions represent scheduled or shareable times when students can join and take the assessment.

This feature supports the teacher side of exams: creating rooms, configuring when and how students can access a session, setting pass/retake rules, and reviewing outcomes.

The analytics view helps teachers understand session results and suspicious behavior. Actual exam-taking and proctoring capture are covered by the next feature, but this feature needs to expose the session-level management and summary views.

The current artifacts show teacher/admin intent, but exact role enforcement still needs verification. Mobile teacher/exam screens exist but are mostly mock-backed.

Artifact refs: `feature-list.md` F008, `user-stories.md` US011 and US014, `behavior-logic.md` BL040-BL047, `permissions.md` PERM023-PERM025.


---

# docs/features/f008-exam-room-session-management/edge-cases.md

# F008 Edge Cases - Exam Room & Session Management

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| Non-authenticated user opens management page | ProtectedRoute redirects to login. | Please sign in to manage exam rooms. |
| Authenticated non-teacher opens teacher route | Current web route may allow auth-only access; backend should enforce ownership/role. | You do not have permission to manage exam rooms. |
| User edits a room they do not own | Backend rejects mutation. | You can only edit your own exam rooms. |
| Session schedule is invalid | Save/start should be blocked. | Check the session start and end time. |
| Access code/whitelist is missing for restricted session | Session should not be publishable until access rule is valid. | Complete the access settings before sharing. |
| Retake rule conflicts with existing attempts | Backend should preserve existing attempt integrity; exact behavior Needs verification. | Retake settings could not be changed for this session. |
| Analytics has no attempts | Show empty analytics state. | No attempts have been submitted yet. |
| Cheating log route mismatch | Analytics may fail until singular/plural API path is verified. | Integrity logs could not be loaded. |


---

# docs/features/f008-exam-room-session-management/screens.md

# F008 Screens - Exam Room & Session Management

## Screen List
- SCR026 `/k/manage-exam-room` - exam room list and creation.
- SCR027 `/k/manage-exam-room/:id` - room detail and session list/configuration.
- SCR028 `/k/manage-exam-room/:id/session/:sessionId` - session analytics.
- SCR029 `/k/my-exams` - student available exams list, downstream entry to F009.
- SCR110 Android MyExamsScreen - mock-backed exam list/detail/quiz/result states.
- SCR111 Android DeThiScreen - mock-backed exam set management and stats.
- SCR116 Android TeacherScreen - mock-backed content management UI.
- SCR210 iOS MyExamsView - mock-backed attempts/detail/quiz/result states.
- SCR212 iOS TeacherView - mock-backed teacher content management.

## User Journey
1. Teacher opens Manage Exam Rooms.
2. Teacher creates or selects a room.
3. Teacher configures sessions with schedule, access, sharing, pass score, and retake settings.
4. Teacher starts or updates session status where allowed.
5. Students discover/join sessions through My Exams or standalone links; detailed taking flow is F009.
6. Teacher opens session analytics to review attempts and integrity logs.

Artifact refs: `screen-list.md` SCR026-SCR029, SCR110, SCR111, SCR116, SCR210, SCR212; `screen-flow.md` FLW030-FLW034.


---

# docs/features/f008-exam-room-session-management/technical-spec.md

# F008 Technical Spec - Exam Room & Session Management

## Functional Requirements
- FR001: Authenticated teacher/owner users can create, list, view, update, and delete exam rooms.
- FR002: Room managers can create and configure exam sessions under a room.
- FR003: Session settings include schedule, lifecycle status, access code, whitelist/sharing, passing score, assessment type, and retake rules where supported.
- FR004: Managers can start/update sessions and configure sharing/access.
- FR005: Managers can view session analytics for attempts and cheating logs.
- FR006: Student exam list can link learners to available exam sessions.
- FR007: Mobile teacher/exam screens exist but are mock-backed; shared APIs exist.

## Business Rules
- BR001: Exam room/session management requires authentication and ownership. Source: PERM023, PERM024.
- BR002: Teacher/admin intent exists, but frontend TeacherRoute only checks authentication; backend role enforcement Needs verification. Source: BL008, PERM023.
- BR003: Session analytics are intended for room owners/teacher/admin users; exact enforcement Needs verification. Source: PERM025.
- BR004: Join/start exam behavior belongs to F009, but session access settings created here control that downstream flow.
- BR005: Session lifecycle state transitions and retake limits Need verification. Source: BL041.

## State Management
- SM001: Web uses `examRoomApi.ts`, `examSessionApi.ts`, and exam room/session stores for room/session management.
- SM002: Session analytics reads attempts and cheating logs for a selected session.
- SM003: Mobile shared `ExamRoomApiService` exists; Android/iOS teacher/exam screens are mock-backed.

## Algorithms
- ALG001: Room management creates a room linked to owner/host and selected quiz content.
- ALG002: Session configuration validates schedule/access/retake settings before publish/start.
- ALG003: Analytics aggregates attempts, scores, pass/fail, and violation data. Exact aggregation formulas Need verification.

## Integrations
- INT001: API005 `/api/v1/examrooms/*` for room CRUD.
- INT002: API005 `/api/v1/examsessions/*` for session CRUD/start/sharing.
- INT003: API005 `/api/v1/examattempts/*` for attempt data used in analytics.
- INT004: API015 cheating log API for proctoring analytics; singular/plural route mismatch Needs verification.
- INT005: API010 student materials may surface available exams.

## Key Entities
- MODEL018 `ExamRoom`
- MODEL019 `ExamSession`
- MODEL020 `ExamAttempt`
- MODEL021 `CheatingLog`
- MODEL055 mobile `ExamRoomModels.kt`
- MODEL056 mobile `ExamAttemptModels.kt`

## Artifact References
- `feature-list.md` F008
- `user-stories.md` US011, US014
- `screen-list.md` SCR026, SCR027, SCR028, SCR029, SCR110, SCR111, SCR116, SCR210, SCR212
- `screen-flow.md` FLW030, FLW031, FLW034, FLW108, FLW206
- `behavior-logic.md` BL040-BL047, BL070-BL072
- `api-map.md` API005, API010, API015
- `permissions.md` PERM023-PERM028, PERM040
- Source paths: web `src/apis/examRoomApi.ts`, `src/apis/examSessionApi.ts`, `src/apis/examAttemptApi.ts`, `src/apis/cheatingLogApi.ts`; mobile `ExamRoomApiService`, `ExamAttemptApiService`; exact store/component files Need verification.


---

# docs/features/f009-exam-taking-attempts-integrity-logging/business-context.md

# F009 - Exam Taking, Attempts & Integrity Logging Business Context

## Why It Matters
Examio must let students take assigned exams reliably while giving teachers confidence that the results were produced under fair conditions. The feature protects both learning assessment and trust in exam outcomes.

## Who Uses It
Students use it when joining and completing an exam. Teachers or exam hosts depend on the captured attempt and integrity records when reviewing participation and suspicious activity.

## What They Do
A student opens the exam link, passes the required access check, starts or resumes the quiz, answers questions, and submits the attempt. While the quiz is active, the app watches for suspicious browser actions and records integrity events when they happen.

## Known Limits
Some important behavior still Needs verification: exact anti-cheating thresholds, whether a violation only warns or can end an exam, exact secure quiz route names, and complete mobile production wiring.


---

# docs/features/f009-exam-taking-attempts-integrity-logging/edge-cases.md

# F009 - Exam Taking, Attempts & Integrity Logging Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| Invalid or expired session access | API/session/code check rejects entry before quiz route is usable. | Unable to access this exam session. |
| Attempt already exists | System resumes saved progress where supported. Exact conflict rules Need verification. | Resuming your previous attempt. |
| Retake not allowed | Attempt start is blocked by session retake rules. | You cannot retake this exam. |
| Secure quiz payload cannot be decrypted | Quiz cannot render; user should retry or contact support. Exact behavior Needs verification. | We could not load the secure quiz. Please try again. |
| Network loss during answer save | Local UI may keep current answer, but persistence result Needs verification. | Connection lost. Your latest answer may not be saved. |
| Proctoring violation detected | Cheating log is sent and violation count may update. Penalty thresholds Need verification. | Suspicious activity was detected and recorded. |
| Cheating log route mismatch | Singular/plural API mismatch may fail logging until route is verified. | We could not record the integrity event. |
| Submit after session ended | Backend should reject or mark late submission according to session policy; exact behavior Needs verification. | This exam session is no longer accepting submissions. |


---

# docs/features/f009-exam-taking-attempts-integrity-logging/screens.md

# F009 - Exam Taking, Attempts & Integrity Logging Screens

## Screen List
- SCR031 `/exam-session/:id` - Exam Session Entry: standalone entry screen that verifies code/link/access before quiz access.
- SCR032 `/exam-session/:id/quiz` - Exam Quiz: standalone secure quiz and proctoring flow.
- SCR210 MyExamsView - iOS mock-backed exam attempts/detail/quiz/result states; production API wiring Needs verification.
- Android mobile My Exams/Quiz screens - referenced by FeatureList as mobile quiz/result states; exact SCR codes Need verification from mobile screen inventory.

## User Journey
1. Student opens an exam session link or enters through the exam session route.
2. System loads session details and checks whether the student can join.
3. Student starts or resumes the attempt and receives quiz content.
4. Student answers questions, moves between questions, marks items, and progress is saved.
5. Proctoring events are logged when suspicious browser behavior is detected.
6. Student submits the exam and sees result/history according to available attempt data.

## Artifact References
- `screen-list.md` SCR031, SCR032, SCR210.
- `screen-flow.md` FLW033, FLW034.
- `feature-list.md` F009.


---

# docs/features/f009-exam-taking-attempts-integrity-logging/technical-spec.md

# F009 - Exam Taking, Attempts & Integrity Logging Technical Spec

## Functional Requirements
- FR001: Let a student join an exam session through the standalone exam entry route when session/link/code access is accepted.
- FR002: Start or resume an exam attempt and persist answer progress, current question index, marked questions, score, violation count, and attempt status.
- FR003: Deliver secure quiz payloads for active attempts; encrypted payload/JWT-per-question behavior is cited but exact route and crypto contract Need verification.
- FR004: Submit final answers and calculate attempt result/history through exam attempt APIs.
- FR005: Capture integrity events from the web proctoring hook, including tab switch, window blur, devtools, copy/paste, right-click, fullscreen exit, and print-screen signals.

## Business Rules
- BR001: Only an exam participant/session client with valid access may take an exam or log cheating violations. Linked FR: FR001, FR005.
- BR002: Exam session lifecycle, access code/whitelist/sharing, passing score, and retake rules influence whether attempts can start or continue; detailed transitions Need verification. Linked FR: FR001, FR002.
- BR003: Standalone web exam routes are not ProtectedRoute-wrapped; API/session/code authorization is the enforcement point. Linked FR: FR001.
- BR004: Anti-cheating penalties, thresholds, and lockout/end-exam behavior Need verification. Linked FR: FR005.

## State Machines
- SM001: Exam session access: entry route opened -> session loaded -> access verified -> quiz route allowed or denied. Linked FR: FR001.
- SM002: Attempt lifecycle: not started -> started/resumed -> in progress -> submitted/result. Exact backend statuses Need verification. Linked FR: FR002, FR004.
- SM003: Integrity lifecycle: signal detected -> cheating log API called -> violation count updated -> user continues or session action occurs. Threshold behavior Need verification. Linked FR: FR005.

## Algorithms
- ALG001: Secure quiz retrieval should avoid exposing full answer data before submission; current artifacts cite encrypted quiz payloads and client AES helpers, but exact validation/decryption path Needs verification. Linked FR: FR003.
- ALG002: Scoring compares submitted answers against quiz answers and stores score/result in ExamAttempt; exact partial-credit behavior Needs verification. Linked FR: FR004.

## Integrations
- INT001: Web routes `/exam-session/:id` and `/exam-session/:id/quiz` drive session entry and quiz taking. Linked FR: FR001-FR004.
- INT002: Exam Rooms/Sessions/Attempts API (API005) includes `/api/v1/examsessions/:id/join` and exam attempt start/resume/submit routes; exact path list Needs verification. Linked FR: FR001-FR004.
- INT003: Proctoring API (API015) logs cheating violations; route naming mismatch `/cheatinglog` vs `/cheatinglogs/*` Needs verification. Linked FR: FR005.
- INT004: Mobile shared KMP `ExamAttemptApiService` exists, while Android/iOS exam quiz UI is mock-backed. Linked FR: FR002-FR004.

## Key Entities
- MODEL019 ExamSession: status, timestamps, assessType, accessCode, whitelist, passingScore, allowRetake.
- MODEL020 ExamAttempt: score, answers, currentIndex, markedQuestions, violationCount, status.
- MODEL021 CheatingLog: attempt-linked violation type such as TAB_SWITCH, WINDOW_BLUR, DEVTOOLS_OPEN.

## Artifact References
- `feature-list.md` F009.
- `user-stories.md` US012, US013.
- `screen-list.md` SCR031, SCR032.
- `screen-flow.md` FLW033, FLW034.
- `behavior-logic.md` BL041, BL043, BL044, BL046.
- `api-map.md` API005, API015.
- `permissions.md` PERM028.
- Source paths cited by artifacts: web `useCheatingDetection`, `cheatingLogApi.ts`, `examSessionApi.ts`, `examAttemptApi.ts`; exact source paths Need verification.


---

# docs/features/f010-wallet-payments-subscription-benefits/business-context.md

# F010 - Wallet, Payments & Subscription Benefits Business Context

## Why It Matters
Wallet and subscription handling lets Examio charge for premium usage and unlock paid benefits without manual support intervention. It connects purchase intent, payment confirmation, and access to paid capabilities.

## Who Uses It
Students, teachers, or any authenticated user can review their balance and subscription. The finance system and webhook flow apply payments in the background. Other services use subscription benefits to decide whether paid features are available.

## What They Do
A user opens the subscription area, reviews available benefits, creates a payment, scans or follows payment instructions, and waits for the status to update. When the payment provider confirms the payment, Examio updates the wallet, transaction history, and subscription benefits.

## Known Limits
Production behavior Needs verification for frontend free-mode bypass, exact subscription plan endpoint coverage, payment cancellation, polling timeout, and mobile account-wallet API wiring.


---

# docs/features/f010-wallet-payments-subscription-benefits/edge-cases.md

# F010 - Wallet, Payments & Subscription Benefits Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| Wallet missing after registration | Finance wallet creation should run through event/gRPC flow; retry/recovery Needs verification. | Your wallet is being created. Please try again soon. |
| Payment creation fails | No QR/payment instruction is shown; user can retry. | We could not create the payment. Please try again. |
| Payment polling times out | UI stops waiting or asks user to refresh; exact timeout Needs verification. | Payment is still pending. Please check again shortly. |
| Webhook arrives twice | Backend should avoid double-crediting; idempotency Needs verification. | Payment already processed. |
| Webhook API key invalid | Webhook is rejected and payment remains pending. | Payment confirmation could not be verified yet. |
| Payment succeeds but wallet refresh fails | Payment record may be updated, but UI still shows stale balance until refresh. | Payment received. Refreshing your wallet failed. |
| Subscription plan endpoint missing | UI/client referenced endpoint may not match backend route table. | Subscription plans are temporarily unavailable. |
| Free-mode bypass enabled | Frontend may allow usage without credit checks; production policy Needs verification. | Premium checks are currently unavailable. |


---

# docs/features/f010-wallet-payments-subscription-benefits/screens.md

# F010 - Wallet, Payments & Subscription Benefits Screens

## Screen List
- SCR015 `/k/subscription` - Subscription / Wallet: protected web screen for wallet, subscription plans, QR payment, and transactions.
- SCR114 AccountScreen - Android account/profile/wallet/settings sections; mock-backed UI with API-ready repository.
- SCR211 AccountView - iOS account/profile/wallet/settings sections; mock-backed.

## User Journey
1. Authenticated user opens the subscription or account wallet area.
2. System displays current wallet balance, subscription status, available plans, and transaction history where wired.
3. User selects a payment/subscription option.
4. System creates a payment and shows QR or payment instructions.
5. User completes payment externally.
6. App polls status or refreshes after webhook processing.
7. Wallet balance, transaction history, and subscription benefits update.

## Artifact References
- `screen-list.md` SCR015, SCR114, SCR211.
- `screen-flow.md` FLW052.
- `feature-list.md` F010.


---

# docs/features/f010-wallet-payments-subscription-benefits/technical-spec.md

# F010 - Wallet, Payments & Subscription Benefits Technical Spec

## Functional Requirements
- FR001: Show authenticated users wallet balance, subscription status, plans, and transaction history.
- FR002: Create a payment for credits or subscription benefits and display QR/payment instructions.
- FR003: Poll payment status and refresh wallet/subscription state after completion.
- FR004: Cancel pending payments where supported; exact cancellation route and states Need verification.
- FR005: Process SePay webhooks to update payment, wallet balance, transaction history, and subscription activation.
- FR006: Expose subscription benefits to other services through finance gRPC.

## Business Rules
- BR001: Users can view only their own wallet, payments, and subscription information. Linked FR: FR001-FR004.
- BR002: New user registration triggers wallet creation through event/gRPC-backed finance workflow. Linked FR: FR001.
- BR003: Webhook calls require API-key protection per scout evidence. Linked FR: FR005.
- BR004: `FREE_MODE = true` currently bypasses frontend credit checks; production intent Needs verification. Linked FR: FR001, FR006.
- BR005: Payment success/failure must be reflected in wallet/subscription events and persisted records. Linked FR: FR003, FR005.

## State Machines
- SM001: Payment lifecycle: created -> pending/QR shown -> paid/succeeded or failed/cancelled -> wallet/subscription refreshed. Exact enum values Need verification. Linked FR: FR002-FR005.
- SM002: Subscription lifecycle: none/basic/advanced/vip -> activated -> expired/changed. Exact expiry renewal behavior Needs verification. Linked FR: FR001, FR005, FR006.
- SM003: Wallet lifecycle: missing on new account -> created -> balance updated -> transaction recorded. Linked FR: FR001, FR005.

## Algorithms
- ALG001: Payment status polling repeatedly checks payment state until success, failure, cancellation, or timeout. Timeout/backoff policy Needs verification. Linked FR: FR003.
- ALG002: Webhook reconciliation maps SePay callback data to a Payment record, then applies wallet/subscription updates idempotently; idempotency details Need verification. Linked FR: FR005.

## Integrations
- INT001: Web route `/k/subscription` presents wallet, plans, QR payment, and transactions. Linked FR: FR001-FR004.
- INT002: Wallet/Payments/Subscription API (API016) uses `/api/v1/wallet/*`, `/api/v1/payment/*`, and gRPC wallet/subscription methods. Linked FR: FR001-FR006.
- INT003: External Webhook API (API017) accepts `POST /webhook/sepay`. Linked FR: FR005.
- INT004: Service events include `payment.success`, `payment.failed`, `wallet.created`, `wallet.updated`, `subscription.activated`, and `subscription.expired`. Linked FR: FR005.
- INT005: Mobile KMP `WalletApiService` exists; account wallet views are mostly mock-backed. Linked FR: FR001.

## Key Entities
- MODEL006 Wallet: user wallet balance, one-to-one with User.
- MODEL007 WalletTransaction: amount, type, direction (`ADD`/`SUBTRACT`).
- MODEL008 Payment: amount, currency, status, paymentType, SePay virtual account data.
- MODEL009 UserSubscription: tier values `0=none`, `1=basic`, `2=advanced`, `3=vip`.
- MODEL032 wallet.proto: `CreateWallet`, `GetWallet`, `UpdateBalance`.
- MODEL033 subscription.proto: `GetUserBenefits`.

## Artifact References
- `feature-list.md` F010.
- `user-stories.md` US016, US017.
- `screen-list.md` SCR015, SCR114, SCR211.
- `screen-flow.md` FLW052.
- `behavior-logic.md` BL060, BL061, BL063, BL064.
- `data-model.md` MODEL006-MODEL009, MODEL032, MODEL033, MODEL037.
- `api-map.md` API016, API017.
- `permissions.md` PERM012.
- Source paths cited by artifacts: web `subscriptionApi.ts`, KMP `WalletApiService`, Account screens; exact source paths Need verification.


---

# docs/features/f011-storage-media-file-lifecycle/business-context.md

# F011 - Storage, Media & File Lifecycle Business Context

## Why It Matters
Examio depends on uploaded files for AI generation, tutor knowledge, chat context, OCR, history, and profile personalization. A reliable storage lifecycle keeps user files available when needed and removes them when no longer owned or referenced.

## Who Uses It
Users upload documents and images. AI and OCR services process files behind the scenes. Profile, AI tool, history, and knowledge-management screens all depend on stored file metadata.

## What They Do
A user chooses a file or image, uploads it, and later sees it in a relevant flow such as recent uploads, generated history, AI chat, profile media, or knowledge management. When a file is deleted, the system should remove both the database record and the remote object when applicable.

## Known Limits
Exact R2 HTTP proxy route coverage, old media cleanup, delete ordering, OCR retry behavior, and R2 deletion on database record deletion all Need verification.


---

# docs/features/f011-storage-media-file-lifecycle/edge-cases.md

# F011 - Storage, Media & File Lifecycle Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| File exceeds limit | Upload is rejected by client or backend. Exact backend limit Needs verification. | File is too large to upload. |
| Unsupported mimetype | Upload/processing should be rejected. Supported type list Needs verification. | This file type is not supported. |
| R2 upload succeeds but DB write fails | Orphan remote object may exist unless compensation runs; behavior Needs verification. | Upload could not be saved. Please try again. |
| DB delete succeeds but R2 delete fails | Metadata may disappear while remote object remains; cleanup Needs verification. | File was removed from your library, but storage cleanup may retry. |
| Signed URL expired | Client must request a fresh URL. | File link expired. Please reopen the file. |
| OCR processing fails | Document status should show failed and allow retry if supported. | We could not process this document. |
| Old avatar/banner remains after replacement | Old media cleanup Needs verification. | Profile image updated. |
| User requests another user's file | Access is denied by ownership/service auth. | You do not have access to this file. |


---

# docs/features/f011-storage-media-file-lifecycle/screens.md

# F011 - Storage, Media & File Lifecycle Screens

## Screen List
- Profile avatar/banner upload screen - tied to profile management; exact SCR ref Needs verification from screen-list detail.
- AI upload flows - used by `/k/ai-tool` and AI generation flows; exact SCR refs Need verification.
- GenAI knowledge file manager - used by `/k/genai-knowledge`; exact SCR refs Need verification.
- History/recent uploads surfaces - show files or generated history linked to uploads; exact SCR refs Need verification.

## User Journey
1. User opens a profile, AI upload, chat, history, or knowledge-management surface.
2. User selects a file or image.
3. System uploads the content and records metadata.
4. The file becomes available for display, processing, generation, OCR, or knowledge use.
5. User or system may delete the file/record.
6. The associated remote R2 asset should be removed when no longer needed; implementation Needs verification.

## Artifact References
- `feature-list.md` F011.
- `user-stories.md` US008, US015, US018.
- `screen-flow.md` FLW050, plus AI upload/generation flows from F006; exact flow refs Need verification.


---

# docs/features/f011-storage-media-file-lifecycle/technical-spec.md

# F011 - Storage, Media & File Lifecycle Technical Spec

## Functional Requirements
- FR001: Upload user files/media through gateway/exam-service to R2 and store metadata in the database.
- FR002: Generate or fetch signed/file URLs for user-scoped files.
- FR003: List recent uploads and file metadata for AI/history/knowledge workflows.
- FR004: Delete uploaded files and associated metadata where supported.
- FR005: Upload profile avatar/banner media through the R2 image API.
- FR006: Preserve processed document chunks/status for AI, OCR, RAG, and knowledge flows.

## Business Rules
- BR001: File access and lifecycle operations must be user-scoped or service-authorized. Linked FR: FR001-FR004.
- BR002: AI/PDF uploads require authenticated user access and upload limits; exact backend limits Need verification. Linked FR: FR001, FR003.
- BR003: Profile/media image upload is part of own-profile management. Linked FR: FR005.
- BR004: When deleting a DB record that has an R2 asset, the R2 object should also be deleted per repo rule; current implementation behavior Needs verification. Linked FR: FR004.
- BR005: OCR/document processing status should remain aligned with storage metadata. Linked FR: FR006.

## State Machines
- SM001: File lifecycle: selected -> uploaded to R2 -> DB metadata created -> processing requested -> processed/failed -> listed or deleted. Linked FR: FR001, FR003, FR004, FR006.
- SM002: Profile image lifecycle: selected -> uploaded through image API -> profile avatar/banner updated -> old asset cleanup Need verification. Linked FR: FR005.
- SM003: OCR lifecycle: upload/document -> OCR requested -> completed or failed. Exact retry behavior Needs verification. Linked FR: FR006.

## Algorithms
- ALG001: Upload flow streams or forwards client files to gateway/exam-service, then R2 gRPC `UploadFile`, then writes `UserStorage` metadata. Linked FR: FR001.
- ALG002: Delete flow should call R2 gRPC `DeleteFile` and remove or update DB metadata; ordering/compensation Need verification. Linked FR: FR004.

## Integrations
- INT001: R2 Storage API/gRPC (API012) includes `UploadFile`, `GetFileUrl`, `DeleteFile`, and `ListUserFiles`; HTTP proxy route list Needs verification. Linked FR: FR001-FR004.
- INT002: OCR Service API/gRPC (API013) processes PDFs through `ProcessPdf` and `HealthCheck`. Linked FR: FR006.
- INT003: AI Upload/Generation API (API006) uses storage for quick upload, generate-from-file, upload, recent uploads, and upload deletion. Linked FR: FR001, FR003, FR004.
- INT004: Service events include `ocr.requested`, `ocr.completed`, and `ocr.failed`. Linked FR: FR006.
- INT005: Profile avatar/banner upload uses R2 image API from web profile flows. Linked FR: FR005.

## Key Entities
- MODEL027 UserStorage: filename, url, mimetype, size, keyR2, processingStatus, creditCharged.
- MODEL025 HistoryGeneratedQuizz and MODEL026 HistoryGeneratedFlashcard: generated history linked to UserStorage.
- MODEL034 r2.proto: `UploadFile`, `GetFileUrl`, `DeleteFile`, `ListUserFiles`.
- MODEL035 ocr.proto: `ProcessPdf`, `HealthCheck`.
- MODEL024 AIChatDocument: links chat to user storage for multi-document support.

## Artifact References
- `feature-list.md` F011.
- `user-stories.md` US008, US015, US018.
- `screen-list.md` profile upload, AI upload flows, GenAI knowledge file manager; exact SCR refs Need verification.
- `behavior-logic.md` BL050, BL053, BL057.
- `data-model.md` MODEL024, MODEL025-MODEL027, MODEL034, MODEL035.
- `api-map.md` API012, API013, API006, API018.
- `permissions.md` PERM018, PERM029, PERM033, PERM038 where applicable.
- Source paths cited by artifacts: web `/r2/image`, AI upload clients, R2 gRPC service; exact source paths Need verification.


---

# docs/features/f012-cross-platform-mobile-companion/business-context.md

# F012 - Cross-Platform Mobile Companion Business Context

## Why It Matters
The mobile companion makes Examio available beyond the web app. It helps users sign in, browse core learning areas, and continue important workflows from Android and iOS devices.

## Who Uses It
Mobile students and teachers use it to access Examio on phones. Product and engineering teams use it as the foundation for bringing web-backed learning, exam, AI, wallet, and account workflows into native experiences.

## What They Do
A mobile user signs in, lands in a tab-based app, and moves between home, AI, study, exams, history, account, wallet, and teacher areas. Auth is real, while many feature screens currently demonstrate the intended experience with local sample state until production repository wiring is completed.

## Known Limits
Most non-auth mobile screens are mock-backed. Mobile AI streaming is not implemented. iOS uses a separate auth client rather than shared KMP token storage. Non-auth deep links and full DTO parity Need verification.


---

# docs/features/f012-cross-platform-mobile-companion/edge-cases.md

# F012 - Cross-Platform Mobile Companion Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| Token restore fails on launch | User remains or returns to auth flow. iOS restore semantics Need verification. | Please sign in again. |
| OAuth callback deep link missing token | Auth cannot complete and user stays on login. | Sign-in callback was invalid. Please try again. |
| Non-auth deep link received | Destination handling completeness Needs verification. | This link is not supported yet. |
| Mobile feature screen expects API data | Many screens use local mock state instead of repositories. | This mobile feature is not fully connected yet. |
| AI streaming requested on mobile | SSE actual implementations throw `NotImplementedError`. | Live AI streaming is not available on mobile yet. |
| Backend DTO differs from KMP model | Request may fail or data may render incorrectly; parity Needs verification. | We could not load this content. Please update the app or try later. |
| iOS shared token storage used by KMP flow | KMP iOS SecureTokenStorage is stubbed; private Swift Keychain auth is used instead. | Please sign in again. |
| Offline or poor network | API-backed auth/actions fail; mock-backed screens may still navigate locally. | You appear to be offline. Check your connection. |


---

# docs/features/f012-cross-platform-mobile-companion/screens.md

# F012 - Cross-Platform Mobile Companion Screens

## Screen List
- SCR101-SCR105 Android auth screens - API-backed auth.
- SCR108-SCR109 Android AI chat/tool screens - shared API ready, platform UI mock-backed; SSE stubbed.
- SCR110-SCR111 Android quiz/exam screens - shared API ready, platform UI mock-backed.
- SCR112 Android flashcards/study - shared API ready, platform UI mock-backed.
- SCR113 Android history - shared API ready, platform UI mock-backed.
- SCR114-SCR115 Android account/wallet - shared API ready, mostly mock-backed except auth/logout.
- SCR116 Android teacher management - not wired/mock-backed.
- SCR201-SCR205 iOS auth flow/login/register/forgot/reset - API-backed.
- SCR206 iOS main tab shell - mixed backing after auth.
- SCR207-SCR213 iOS home, AI, study, exams, account, teacher, placeholder - mostly mock-backed.

## User Journey
1. User launches the mobile app.
2. If unauthenticated, user signs in, registers, resets password, or completes OAuth.
3. Token persistence moves the user into the main tab shell.
4. User navigates between home, AI, study, exams, history, account/wallet, and teacher tabs.
5. Auth-backed functions call real APIs; most feature screens currently update local UI state.
6. Deep links route auth callbacks and may route other destinations once verified.

## Artifact References
- `screen-list.md` Android Mobile Screens and iOS Mobile Screens sections.
- `screen-flow.md` FLW201-FLW206 and Android Flow section.
- `feature-list.md` F012.


---

# docs/features/f012-cross-platform-mobile-companion/technical-spec.md

# F012 - Cross-Platform Mobile Companion Technical Spec

## Functional Requirements
- FR001: Provide mobile auth flows for login, register, reset password, Google OAuth, token persistence, and logout.
- FR002: Expose mobile tab/navigation shells for home, AI, study, exams, history, account/wallet, and teacher management.
- FR003: Use shared KMP API/repository contracts for auth, quiz sets, flashcards, exams, AI generation, student materials, wallet, and related DTOs where wired.
- FR004: Support mobile deep links for auth callbacks and intended exam/flashcard/chat/profile destinations; non-auth completeness Needs verification.
- FR005: Represent mobile feature UI states for AI, study, exams, account, and teacher flows, currently mostly backed by local mock state beyond auth.
- FR006: Handle mobile SSE interface gaps; actual Android/iOS SSE implementations throw `NotImplementedError`, so AI streaming is unavailable on mobile.

## Business Rules
- BR001: Mobile users must authenticate before using main app tabs. Linked FR: FR001, FR002.
- BR002: Android auth uses shared KMP AuthRepository and encrypted token storage. Linked FR: FR001.
- BR003: iOS auth uses a private Swift URLSession client and KeychainTokenStore; KMP iOS SecureTokenStorage is stubbed. Linked FR: FR001.
- BR004: Most non-auth Android/iOS feature screens are mock-backed and should not be treated as production API-backed behavior without verification. Linked FR: FR002, FR003, FR005.
- BR005: Mobile feature permissions exist in backend/shared repositories, but UI enforcement beyond auth is mostly demonstrational. Linked FR: FR003, FR005.

## State Machines
- SM001: Mobile auth: unauthenticated -> login/register/reset/OAuth -> token persisted -> authenticated main tab shell. Linked FR: FR001.
- SM002: Mobile tab navigation: authenticated shell -> home/AI/study/exams/history/account/teacher tabs -> local feature state transitions. Linked FR: FR002, FR005.
- SM003: Deep link handling: URL received -> parsed target -> auth callback or feature destination. Non-auth destinations Need verification. Linked FR: FR004.

## Algorithms
- ALG001: Token restore on launch determines unauthenticated vs authenticated shell; Android and iOS implementations differ, and iOS restore semantics Need verification. Linked FR: FR001.
- ALG002: Shared KMP API clients map gateway `/api/v1` contracts into mobile DTOs; DTO parity with backend responses Needs verification for secure quiz, payments, AI chat streaming, and subscription plans. Linked FR: FR003.

## Integrations
- INT001: Auth APIs (API001) are used by mobile auth flows. Linked FR: FR001.
- INT002: Study/exam/AI/wallet APIs (API003, API004, API005, API006, API009, API010, API016) are represented in shared KMP services. Linked FR: FR003.
- INT003: Android `ExamioApp` tabs and iOS `ContentView` TabView host mobile screens. Linked FR: FR002.
- INT004: Android `examio://auth` and iOS `examio` URL scheme support OAuth/auth callbacks. Linked FR: FR004.

## Key Entities
- Mobile DTOs mirror backend models through shared KMP types, including User/Profile/Wallet, QuizSet, FlashcardSet, ExamRoom, ExamSession, ExamAttempt, AIChat, and subscription plan models.
- MODEL058 ProfileModels.kt / WalletModels.kt: UserProfile, update profile, transactions, wallet details, subscription plan.
- Backend entities are reused indirectly through APIs: MODEL001 User, MODEL006 Wallet, MODEL010 QuizSet, MODEL014/015 FlashcardSet/FlashCard, MODEL018-MODEL020 exams, AI/storage models.

## Artifact References
- `feature-list.md` F012.
- `user-stories.md` US019, US020.
- `screen-list.md` SCR101-SCR116, SCR201-SCR213, especially SCR206, SCR210, SCR211.
- `screen-flow.md` FLW201-FLW206 and Android Flow section.
- `behavior-logic.md` BL010, BL011, BL071, BL072, BL074.
- `api-map.md` API001, API003, API004, API005, API006, API009, API010, API016.
- `permissions.md` PERM040.
- Source paths cited by artifacts: `examio-app` Android Compose screens, iOS SwiftUI views, shared KMP repositories; exact file paths Need verification.


---

# docs/flows/ai-file-processing-flow.md

# FLOW002 - AI File Processing Flow

## Purpose
Document the cross-feature lifecycle for AI file upload, storage, OCR/RAG processing, and generated quiz/flashcard outputs.

## Actors/systems
- Authenticated web user on `/k/ai-tool`
- Web AI generator store and API clients
- Gateway `/api/v1/ai/*`
- Exam service AI modules
- R2 service over gRPC
- Python AI service for OCR, chunking, embeddings, RAG/generation
- PostgreSQL/Prisma `UserStorage`, `Document`, generated history models
- Optional RabbitMQ OCR events
- Mobile AI screens and shared KMP API services, currently mostly mock-backed

## State transitions
- File selected -> upload requested -> file stored in R2 -> `UserStorage` metadata created.
- `UserStorage` created -> processing requested -> OCR/chunking/embedding in progress -> processed or failed.
- Processed upload selected -> generation requested -> async job/history created -> polling -> completed result displayed/saved or failed/cancelled.
- Recent upload/history: created/processed/generated -> listed in recent uploads or PDF/generation history.
- Deletion path: uploaded/history record -> delete requested -> DB metadata and R2 object should be removed/updated. Exact ordering Needs verification.

## Trigger types
- User action: upload file/image, select file, generate quiz/flashcards, cancel/delete job or upload.
- Polling: client polls job status until terminal state.
- Backend async work: OCR/generation jobs update file or history status.
- Event-driven trigger: OCR requested/completed/failed events may be involved; exact topology Needs verification.
- Access/limit trigger: authenticated upload and credit/subscription checks; backend enforcement Needs verification.

## Source artifact refs
- `feature-list.md` F006, F011, F007
- `screen-flow.md` FLW040-FLW043, FLW107, FLW206
- `behavior-logic.md` BL050-BL056, BL065, BL074
- `data-model.md` MODEL022-MODEL028, MODEL034, MODEL035, MODEL039
- `features/f006-ai-file-upload-ocr-content-generation/technical-spec.md`
- `features/f011-storage-media-file-lifecycle/technical-spec.md`
- `features/f007-ai-chat-virtual-tutor/technical-spec.md`

## Edge cases / Needs verification
- Backend/R2 upload size limits and accepted MIME types.
- Whether OCR processing is direct HTTP/gRPC, event-driven, or mixed per path.
- Exact job status enum, retry behavior, cancellation behavior, and timeout policy.
- Credit/subscription enforcement when web `FREE_MODE = true` bypasses client checks.
- R2 cleanup when associated DB records or generated histories are deleted.
- Mobile AI upload/generation and SSE behavior is not production-wired; mobile SSE actuals throw `NotImplementedError`.


---

# docs/flows/auth-session-flow.md

# FLOW001 - Auth Session Flow

## Purpose
Document the cross-client account authentication and session lifecycle for web, backend, and mobile clients.

## Actors/systems
- Anonymous user / authenticated user
- Web app auth store, Axios client, `ProtectedRoute`, `PublicRoute`, `useAuthSync`
- Mobile Android shared KMP `AuthRepository`
- Mobile iOS Swift `AuthApiClient` and `KeychainTokenStore`
- Gateway `/api/v1/auth/*`
- Auth service, `User`, `UserSession`, reset code storage
- Finance workflow for wallet bootstrap after registration

## State transitions
- Anonymous -> authenticating -> authenticated when credential login or registration succeeds.
- Anonymous -> OAuth redirect/browser -> callback/deep link -> tokens persisted -> authenticated shell.
- Authenticated -> refreshing -> authenticated when access token expires and refresh succeeds.
- Authenticated -> refreshing -> expired -> anonymous when refresh fails or session is invalid.
- Authenticated -> logout requested -> session deactivated -> local auth state cleared -> anonymous.
- Password reset: request code -> code sent -> submit code/new password -> reset complete -> login. Exact redirect Needs verification.
- Registration side effect: new user -> `user.created` event/integration -> wallet creation. Exact ordering between auth response and wallet availability Needs verification.

## Trigger types
- User action: register, login, logout, reset password, change password, Google OAuth / One Tap.
- Route guard: accessing `/k/*` unauthenticated or auth pages authenticated.
- HTTP response: 401 triggers web single-flight refresh and retry.
- App lifecycle: mobile launch token restore.
- Backend event/integration: `user.created` triggers finance wallet bootstrap.

## Source artifact refs
- `feature-list.md` F001, F010
- `screen-flow.md` FLW002-FLW006, FLW011-FLW012, FLW101-FLW104, FLW201-FLW204
- `behavior-logic.md` BL001-BL011, BL020-BL024, BL060
- `data-model.md` MODEL001, MODEL002, MODEL004, MODEL031, MODEL036
- `features/f001-account-authentication-session-management/technical-spec.md`
- `features/f010-wallet-payments-subscription-benefits/technical-spec.md`

## Edge cases / Needs verification
- Exact post-password-reset success redirect.
- Exact `/k` root destination after authenticated redirect.
- iOS launch restore semantics and relationship to stubbed KMP secure storage.
- Exact wallet creation failure/retry behavior after registration.
- Whether route-level role checks exist beyond authentication for teacher/admin screens.


---

# docs/flows/exam-attempt-flow.md

# FLOW003 - Exam Attempt Flow

## Purpose
Document the student exam-taking workflow across session entry, attempt lifecycle, secure quiz delivery, answer submission, and integrity logging.

## Actors/systems
- Student / exam participant
- Teacher or room host configuring sessions
- Web standalone exam routes `/exam-session/:id` and `/exam-session/:id/quiz`
- Exam session and attempt APIs
- Proctoring hook and cheating log API
- `ExamSession`, `ExamAttempt`, `CheatingLog`
- Mobile shared KMP exam APIs, with platform exam UI mostly mock-backed

## State transitions
- Session entry opened -> session loaded -> access code/link/whitelist validated -> quiz route allowed or denied.
- Attempt lifecycle: not started -> started/resumed -> in progress -> submitted/result. Exact backend statuses Need verification.
- Answer progress: question viewed -> answer saved/updated -> current index/marked questions updated -> final submit.
- Secure quiz lifecycle: active attempt -> secure/encrypted quiz payload delivered -> client renders questions -> answers submitted. Exact crypto contract Needs verification.
- Integrity lifecycle: proctoring signal detected -> cheating log API called -> violation count/stats updated -> continue or enforced consequence. Threshold behavior Needs verification.

## Trigger types
- User action: open session link, enter access code, start/resume attempt, answer question, mark question, submit.
- Route transition: session entry route to quiz route.
- Backend validation: access rules, retake rules, whitelist, session status, passing score.
- Client integrity signal: tab switch, window blur, devtools, copy/paste, right-click, fullscreen exit, print-screen.
- Submission trigger: final answer submission and scoring.

## Source artifact refs
- `feature-list.md` F008, F009
- `screen-flow.md` FLW030-FLW034
- `behavior-logic.md` BL040-BL047
- `data-model.md` MODEL018-MODEL021, MODEL038
- `features/f008-exam-room-session-management/technical-spec.md`
- `features/f009-exam-taking-attempts-integrity-logging/technical-spec.md`

## Edge cases / Needs verification
- Detailed `ExamSession` status transitions and allowed transitions.
- Exact join/start/resume/submit API paths and response shapes.
- Exact secure quiz encryption/JWT-per-question validation path.
- Partial credit, scoring rules, and result/history persistence details.
- Anti-cheating thresholds, lockout/end-exam consequences, and whether warnings are shown before enforcement.
- Teacher/admin authorization for managing rooms and sessions.


---

# docs/flows/mobile-auth-flow.md

# FLOW005 - Mobile Auth Flow

## Purpose
Document the mobile-specific authentication lifecycle across Android, iOS, shared KMP APIs, platform token storage, and OAuth deep links.

## Actors/systems
- Mobile user
- Android Compose app and shared KMP `AuthRepository`
- Android encrypted token storage
- iOS SwiftUI app, private `AuthApiClient`, and `KeychainTokenStore`
- Gateway auth API
- Auth service and `UserSession`
- Platform URL schemes for OAuth callback

## State transitions
- App launch -> token restore attempted -> unauthenticated auth screens or authenticated main tab shell.
- Unauthenticated -> login/register/reset/OAuth -> token persisted -> authenticated main tabs.
- OAuth: login screen -> system browser -> provider/backend callback -> `examio://auth/callback` deep link -> token persistence -> authenticated shell.
- Authenticated -> logout/profile sheet action -> auth logout -> token cleared -> auth landing screen.
- Deep link: URL received -> parsed target -> auth callback handled or feature destination routed. Non-auth destination handling Needs verification.

## Trigger types
- App lifecycle: launch and session restore.
- User action: login, register, reset password, Google OAuth, logout.
- Deep link: `examio://auth/callback` and possible exam/flashcard/chat/profile links.
- API response: auth success/failure, token refresh/restore result.
- Secure storage event: token read/write/delete per platform.

## Source artifact refs
- `feature-list.md` F001, F012
- `screen-flow.md` FLW101-FLW108, FLW201-FLW206
- `behavior-logic.md` BL001, BL005, BL009-BL011, BL070-BL074
- `data-model.md` MODEL001, MODEL002, MODEL048, MODEL049, MODEL058
- `features/f001-account-authentication-session-management/technical-spec.md`
- `features/f012-cross-platform-mobile-companion/technical-spec.md`

## Edge cases / Needs verification
- iOS restore semantics and divergence from shared KMP secure token storage.
- Whether refresh-token rotation and session invalidation are handled identically on Android and iOS.
- Non-auth mobile deep link completion for exam, flashcard, chat, and profile targets.
- Device/session metadata parity with web `X-Device-ID` behavior.
- Most non-auth mobile feature screens use mock UI state and should not be treated as production API-backed.


---

# docs/flows/payment-subscription-flow.md

# FLOW004 - Payment Subscription Flow

## Purpose
Document wallet creation, payment checkout, SePay webhook reconciliation, subscription activation, and benefit checks across finance and dependent services.

## Actors/systems
- Authenticated user
- Web subscription page and QR payment dialog
- Gateway wallet/payment endpoints
- Finance service wallet, payment, and subscription modules
- SePay webhook sender
- Wallet/subscription gRPC services
- RabbitMQ payment/wallet/subscription events
- AI/exam services consuming subscription benefits
- Mobile wallet/account screens, mostly mock-backed despite KMP API presence

## State transitions
- New account -> wallet missing -> wallet created -> balance available. Exact retry/failure behavior Needs verification.
- Payment lifecycle: created -> pending/QR shown -> paid/succeeded or failed/cancelled -> wallet/subscription refreshed. Exact enum values Need verification.
- Webhook lifecycle: SePay callback received -> API key validated -> payment matched -> wallet/subscription updated -> events emitted. Idempotency Needs verification.
- Subscription lifecycle: none/basic/advanced/vip -> activated -> expired/changed. Renewal and downgrade semantics Need verification.
- Benefit check: service request -> finance gRPC `GetUserBenefits` -> allow/limit gated behavior. Exact enforcement points Need verification.

## Trigger types
- User action: open subscription page, create payment, cancel payment, refresh wallet/history.
- Polling: client checks payment status while QR dialog is active.
- External webhook: SePay posts transaction status.
- Backend event: payment, wallet, subscription domain events update downstream state.
- Service-to-service check: AI chat/generation uses subscription benefits.

## Source artifact refs
- `feature-list.md` F010, F001, F006, F007
- `screen-flow.md` FLW052
- `behavior-logic.md` BL060-BL065
- `data-model.md` MODEL006-MODEL009, MODEL032, MODEL033, MODEL037
- `features/f010-wallet-payments-subscription-benefits/technical-spec.md`
- `features/f001-account-authentication-session-management/technical-spec.md`
- `features/f006-ai-file-upload-ocr-content-generation/technical-spec.md`

## Edge cases / Needs verification
- Exact payment status enum and cancellation support.
- Polling timeout/backoff policy.
- Webhook idempotency, duplicate payment handling, and mismatch handling.
- Subscription expiry, renewal, and tier-change semantics.
- Production credit/subscription enforcement while frontend `FREE_MODE = true`.
- Mobile wallet screens are mostly mock-backed; production API wiring Needs verification.


---

# docs/generated/api-map.md

# API Map

Source artifacts: `scout-report.md`, `_session-context.md`, `feature-list.md`.

## API001 - Authentication API
Public and authenticated account entry points handled by gateway -> auth-service.
- Gateway prefix: `/api/v1/auth/*`
- Auth-service routes: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `GET /auth/me`, `POST /auth/sync-refresh-token`, `GET /auth/google`, `POST /auth/google/one-tap`, `GET /auth/google/callback`
- Password routes: `POST /auth/send-code-reset-password`, `POST /auth/reset-password`, `POST /auth/send-code-change-password`, `POST /auth/change-password`
- Features: F001, F012
- Entities: MODEL001 User, MODEL002 UserSession, MODEL004 ResetPasswordCode
- Clients: web `authApi.ts`, Zustand `useAuthStore`, KMP `AuthApiService`, Android/iOS auth screens

## API002 - Verification, Profile & Devices API
Account verification, profile read/update, avatar/banner uploads, and device/session management.
- Gateway prefixes: `/api/v1/auth/*`, `/api/v1/profile/*`, `/api/v1/devices/*`, `/api/v1/r2/*`
- Known routes: `POST /auth/sendVerificationEmail`, `POST /auth/verifyAccount`, `GET /profile/*`, device list/logout endpoints from web `devicesApi.ts`
- Features: F002
- Entities: MODEL001 User, MODEL002 UserSession, MODEL003 VerifyAccountCode
- Clients: web `profileApi.ts`, `devicesApi.ts`, `mediaApi.ts`, KMP `ProfileApiService`
- Needs verification: exact device route list in backend scout is not enumerated.

## API003 - Quiz Set API
Quiz set CRUD, question management, labels, sharing/access, and history save flows.
- Gateway prefix: `/api/v1/quizsets/*`
- Known routes: `POST /quizsets`, `GET /quizsets`, `GET /quizsets/:id`, `PUT /quizsets/:id`, `DELETE /quizsets/:id`, `GET/POST /quizsets/:id/questions`, `POST /quizsets/:id/questions/:qId/label`
- Features: F004, F012
- Entities: MODEL010 QuizSet, MODEL011 QuizSetLabel, MODEL012 QuizQuestion, MODEL013 DetailsQuizQuestion
- Clients: web `quizsetApi.ts`, Zustand `useQuizSetStore`, KMP `QuizSetApiService`

## API004 - Flashcard Set & Study API
Flashcard set CRUD, flashcard management, labels/sharing, and study session progress.
- Gateway prefixes: `/api/v1/flashcardsets/*`, `/api/v1/flashcard-study/*`
- Known routes: `GET/POST /flashcardsets`, `GET/PUT/DELETE /flashcardsets/:id`, `POST /flashcardsets/:id/flashcards`, `POST /flashcard-study/progress`, `POST /flashcard-study/submit-answer`
- Features: F005, F012
- Entities: MODEL014 FlashCardSet, MODEL015 FlashCard, MODEL016 DetailsFlashCard
- Clients: web `flashcardSetApi.ts`, `flashcardStudyApi.ts`, Zustand `useFlashcardSetStore`, KMP `FlashcardApiService`, `FlashcardRepository`

## API005 - Exam Rooms, Sessions & Attempts API
Teacher exam room/session management and student attempt lifecycle.
- Gateway prefixes: `/api/v1/examrooms/*`, `/api/v1/examsessions/*`, `/api/v1/examattempts/*`
- Room/session routes: `POST /examrooms`, `GET /examrooms`, `POST /examsessions`, `GET /examsessions`, `PUT /examsessions/:id`, `POST /examsessions/:id/start`, `POST /examsessions/:id/verify-code`, `POST /examsessions/:id/sharing`, `POST /examsessions/:id/join`
- Attempt routes: `POST/PUT /examattempts`, secure quiz/start/resume/submit routes from web/KMP clients; exact path list needs verification beyond scout summary.
- Features: F008, F009, F012
- Entities: MODEL016 ExamRoom, MODEL017 ExamSession, MODEL018 ExamAttempt
- Clients: web `examRoomApi.ts`, `examSessionApi.ts`, `examAttemptApi.ts`, stores for exam rooms/sessions, KMP `ExamRoomApiService`, `ExamAttemptApiService`

## API006 - AI Upload, Job & Generation Orchestration API
Gateway/exam-service API for uploads, generation jobs, model catalog, recent uploads, and generated history.
- Gateway prefix: `/api/v1/ai/*`
- Known routes: `POST /ai/quick-upload`, `POST /ai/generate-from-file`, `POST /ai/upload`, `POST /ai/upload-image`, `GET /ai/recent-uploads`, `GET /ai/models`, `GET /ai/upload/:uploadId`, `DELETE /ai/upload/:uploadId`, `POST /ai/regenerate/:uploadId`, `GET /ai/job/:jobId`, `DELETE /ai/job/:jobId`, `GET /ai/upload/:uploadId/history`
- Features: F003, F006, F012
- Entities: MODEL021 HistoryGeneratedQuizz, MODEL022 HistoryGeneratedFlashcard, MODEL024 UserStorage, MODEL025 Document
- Clients: web `aiApi.ts`, `examApi.ts`, `historyApi.ts`, `useAIGeneratorStore`, KMP `AIGeneratorApiService`

## API007 - AI Chat API
Chat CRUD, messages, streaming, image upload, and multi-document chat from web to gateway/exam-service/Python AI service.
- Web API base: `/ai-chat/*`
- Python routes: `POST /api/chat/query`, `POST /api/chat/stream`, `GET /api/chat/health`
- Features: F007
- Entities: MODEL018 AIChat, MODEL019 AIChatMessage, MODEL020 AIChatDocument, MODEL024 UserStorage
- Clients: web `aiChatApi.ts`, Zustand `useAITeacherStore`, KMP `AIChatApiService`, `AIChatRepository`
- Needs verification: exact gateway/exam-service `/ai-chat/*` route list is referenced by frontend but not fully enumerated in backend scout.

## API008 - Subject & AI Model Catalog API
Subject taxonomy and model catalog used by AI teacher/generation flows.
- Gateway prefixes: `/api/v1/subjects/*`, `/api/v1/ai/models`
- Known routes: `GET /subjects`, `GET /ai/models`, Python `GET /api/ai/models`
- Features: F007
- Entities: subject/category models are referenced in frontend/KMP, but Prisma subject models are not enumerated in scout database list; Needs verification for MODEL assignment.
- Clients: web `subjectApi.ts`, `aiApi.ts`, `useAIModelCatalogStore`, KMP `SubjectApiService`

## API009 - History API
Aggregated history stats plus PDF and exam history lists.
- Gateway prefixes: `/api/v1/examattempts/*`, `/api/v1/ai/*`
- Known routes: `/examattempts/history-stats`, `/ai/recent-uploads`, `/examattempts/list`
- Features: F003
- Entities: MODEL018 ExamAttempt, MODEL021 HistoryGeneratedQuizz, MODEL022 HistoryGeneratedFlashcard, MODEL024 UserStorage
- Clients: web `historyApi.ts`, `useStatsStore`, KMP `HistoryApiService`

## API010 - Student Materials API
Recent materials, pinned materials, and student-facing access to flashcards/exams.
- Gateway prefix: `/api/v1/student/*`
- Known client base: `/student/materials/`
- Features: F003, F004, F005, F012
- Entities: MODEL010 QuizSet, MODEL014 FlashCardSet, MODEL016 ExamRoom, MODEL017 ExamSession
- Clients: web `studentMaterialsApi.ts`, Zustand `useStudentMaterialsStore`, KMP `StudentMaterialsApiService`
- Needs verification: exact backend student route list not detailed in scout.

## API011 - Python AI Processing API
Direct Python FastAPI endpoints used by NestJS exam-service for OCR, RAG, generation, entity extraction, and cache operations.
- Base prefixes: `/api/ai/*`, `/api/generate/*`
- Routes: `POST /api/ai/process-file`, `POST /api/ai/query-file`, `POST /api/ai/multi-query`, `GET /api/ai/file-status/{id}`, `GET /api/ai/graph-stats/{id}`, `POST /api/ai/extract-entities/{id}`, `GET /api/ai/entities/{id}`, `DELETE /api/ai/clear-cache/{id}`, `POST /api/generate/quiz`, `POST /api/generate/flashcards`, `GET /api/generate/quiz/{history_id}`, `GET /api/generate/flashcards/{history_id}`
- Features: F006, F007
- Entities: MODEL021 HistoryGeneratedQuizz, MODEL022 HistoryGeneratedFlashcard, MODEL024 UserStorage, MODEL025 Document
- Clients: primarily backend exam-service; not usually called directly by web/mobile.

## API012 - R2 Storage API/gRPC
Cloudflare R2 storage upload/download/sign/delete/list capability exposed via service-to-service gRPC and gateway/exam-service routes.
- gRPC package: `r2`
- gRPC methods: `UploadFile`, `GetFileUrl`, `DeleteFile`, `ListUserFiles`
- Gateway prefix: `/api/v1/r2/*`; known route `POST /r2/*`; web image client `/r2/image`
- Features: F002, F006, F011
- Entities: MODEL024 UserStorage, MODEL025 Document
- Needs verification: complete HTTP route list for R2 proxy.

## API013 - OCR Service API/gRPC
PDF OCR processing via hybrid NestJS gRPC service and Python backend.
- gRPC package: `ocr`
- gRPC methods: `ProcessPdf`, `HealthCheck`
- Python backend: `http://127.0.0.1:8003`
- Features: F006, F011
- Entities: MODEL024 UserStorage, MODEL025 Document

## API014 - GenAI Tutor Knowledge API
Teacher/admin knowledge base ingestion, folders/files, graph snapshots, dataset imports, and bulk operations.
- Gateway/exam-service prefix: `/api/v1/ai/tutor/*`
- Python prefix: `/api/tutor/*`
- Known routes: `/ingest`, `/knowledge-files`, `/knowledge-files/{file_id}`, `/knowledge-files/{file_id}/graph`, `/knowledge-files/{file_id}/reprocess`, `/knowledge-files/bulk-delete`, `/knowledge-files/bulk-reprocess`, `/knowledge-folders`, `/knowledge-folders/{folder_id}`, `/knowledge-folders/{folder_id}/contents`, `/knowledge-stats`, `/dataset-imports`, `/dataset-imports/catalog`, `/dataset-imports/{job_id}`, `/dataset-imports/{job_id}/cancel`, `/dataset-imports/{dataset_key}/clear`
- Features: F007
- Entities: MODEL024 UserStorage, MODEL025 Document
- Clients: web `genaiTutorKnowledgeApi.ts`, `useGenAIKnowledgeStore`
- Needs verification: exact permission model; TeacherRoute does not enforce teacher role in scout.

## API015 - Cheating Log API
Exam proctoring violation logging and analytics.
- Gateway routes: `POST /cheatinglog`; frontend client base references `/cheatinglogs/*`
- Features: F009, F008
- Entities: MODEL019 CheatingLog, MODEL018 ExamAttempt
- Clients: web `useCheatingDetection`, `cheatingLogApi.ts`
- Needs verification: route naming mismatch singular/plural.

## API016 - Wallet, Payments & Subscription API
Wallet balance/details, payment QR creation, status/history/cancel, and subscription plan/benefit access.
- Gateway prefixes: `/api/v1/wallet/*`, `/api/v1/payment/*`
- Finance routes: `GET /wallet/info`, `GET /wallet/details`, `POST /payment/create`, `GET /payment/status/:paymentId`, `GET /payment/history`, `DELETE /payment/cancel/:paymentId`
- gRPC packages: `wallet`, `subscription`
- gRPC methods: `CreateWallet`, `GetWallet`, `UpdateBalance`, `GetUserBenefits`
- Features: F010, F012
- Entities: MODEL006 Wallet, MODEL007 WalletTransaction, MODEL008 Payment, MODEL009 UserSubscription
- Clients: web `subscriptionApi.ts`, KMP `WalletApiService`, Account screens
- Needs verification: frontend/mobile subscription plan endpoints such as `/payment/subscription/plans` are referenced but not in backend scout route table.

## API017 - External Webhook API
SePay callback endpoint for payment completion/failure processing.
- Gateway prefix: `/api/v1/webhook/*`
- Finance route: `POST /webhook/sepay`
- Auth: API key per scout
- Features: F010
- Entities: MODEL008 Payment, MODEL006 Wallet, MODEL007 WalletTransaction, MODEL009 UserSubscription

## API018 - Service-to-Service Auth & Events
Internal contracts for JWT validation, permission checks, wallet bootstrap, subscription checks, file storage, OCR, and asynchronous events.
- gRPC auth methods: `ValidateToken`, `GetUserInfo`, `CheckPermission`
- RabbitMQ exchange: `examio.events`
- Event types: `user.created`, `user.updated`, `user.deleted`, `user.verified`, `payment.success`, `payment.failed`, `wallet.created`, `wallet.updated`, `subscription.activated`, `subscription.expired`, `exam.created`, `exam.started`, `exam.submitted`, `ocr.requested`, `ocr.completed`, `ocr.failed`
- Features: F001, F006, F010, F011
- Entities: MODEL001 User, MODEL006 Wallet, MODEL008 Payment, MODEL009 UserSubscription, MODEL024 UserStorage, MODEL025 Document


---

# docs/generated/behavior-logic.md

# Behavior Logic

Generated: 2026-05-27
Source: scout reports and `_scout-bl-inventory.md`. Unknowns are marked `Needs verification`.

## Auth, Session, And Routing

| ID | Logic | Scope | Sources / Notes |
|---|---|---|---|
| BL001 | Login/register issue JWT access tokens, refresh tokens, session id, and auth cookies. | Backend, web, mobile | Auth service `/auth/login`, `/auth/register`; web auth store; mobile AuthRepository/AuthViewModel. |
| BL002 | Authenticated requests prefer cookies on backend, with Bearer token fallback. | Backend | Shared AuthGuard. |
| BL003 | Web Axios injects `Authorization: Bearer {auth_token}` and `X-Device-ID`. | Web | `src/apis/api.ts`. |
| BL004 | Web 401 responses trigger single-flight token refresh, then retry or clear auth and redirect to `/login`. | Web | Handles invalid/expired sessions and model-specific error codes. |
| BL005 | OAuth redirect tokens are read from URL query params, persisted, then stripped from URL. | Web, mobile | Web `useAuthSync`; Android/iOS custom scheme callbacks. |
| BL006 | ProtectedRoute blocks unauthenticated workspace screens and stores return path. | Web | Applies to `/k/*`. |
| BL007 | PublicRoute redirects authenticated users away from login/register/reset screens. | Web | Redirects to `/k`. |
| BL008 | TeacherRoute only checks authentication, not teacher/admin role. | Web | Authorization gap; should not be treated as enforced teacher permission. |
| BL009 | Device/session lifecycle includes `x-device-id`, active session tracking, logout deactivation, and cleanup cron. | Backend, web, mobile | Device list/logout behavior on web; mobile sends device id through KMP interceptor. |
| BL010 | Mobile Android auth uses shared KMP AuthRepository and encrypted token storage. | Android | API-backed. |
| BL011 | Mobile iOS auth uses a private Swift URLSession client and KeychainTokenStore, not shared KMP auth storage. | iOS | KMP iOS SecureTokenStorage is stubbed. |

## API Gateway And Integration

| ID | Logic | Scope | Sources / Notes |
|---|---|---|---|
| BL020 | Gateway proxies `/api/v1/*` to auth, exam, finance, R2-related, webhook, and AI/study controllers. | Backend | Public clients mostly call gateway. |
| BL021 | Gateway forwards cookies and bearer tokens to downstream services. | Backend | Proxy behavior. |
| BL022 | Gateway rate limits requests at about 100 req/min. | Backend | `@nestjs/throttler`; exact route exclusions Need verification. |
| BL023 | Service-to-service validation can use auth gRPC `ValidateToken`, `GetUserInfo`, and `CheckPermission`. | Backend | Authorization model simple role/ownership. |
| BL024 | RabbitMQ topic exchange `examio.events` carries user, payment, wallet, subscription, exam, OCR events. | Backend | Known consumers include finance user-created handler and AI consumer. |

## Learning Content

| ID | Logic | Scope | Sources / Notes |
|---|---|---|---|
| BL030 | Quiz sets support CRUD, labels, questions, sharing/access, history save, and export on web. | Backend, web | Mobile shared API ready; mobile UI mock-backed. |
| BL031 | Flashcard sets support CRUD, labels, flashcards, sharing/access, and study flow. | Backend, web | Mobile shared API ready; mobile UI mock-backed. |
| BL032 | Store caches reduce repeated API calls and are invalidated on mutations. | Web | `storeCache` used by most Zustand stores. |
| BL033 | Student materials expose recent flashcards/exams and pin/unpin/share links. | Backend, web, mobile shared | Mobile UI mock-backed. Exact share flow Needs verification. |
| BL034 | Flashcard study records progress and answer submissions through `/flashcard-study/*`. | Backend, web, mobile shared | Web standalone route; mobile UI mock-backed. |

## Exam And Proctoring

| ID | Logic | Scope | Sources / Notes |
|---|---|---|---|
| BL040 | Exam rooms group sessions and are managed by authenticated users. | Backend, web | Teacher/admin enforcement Needs verification. |
| BL041 | Exam sessions have lifecycle states, access code/whitelist/sharing settings, passing score, and retake rules. | Backend, web, mobile shared | Detailed transitions Need verification. |
| BL042 | Join/start flows allow public code/link entry while backend validates access. | Backend, web | Standalone routes have no web route guard. |
| BL043 | Exam attempts track score, answers, current index, marked questions, violation count, and status. | Backend, web, mobile shared | Mobile UI mock-backed. |
| BL044 | Secure quiz flow can use encrypted quiz payloads/JWT per question and client-side AES helpers. | Backend, web, mobile shared | Mobile decryption plan Needs verification. |
| BL045 | Web exam taking uses reCAPTCHA on protected submission endpoints. | Web, backend | reCAPTCHA provider wraps app. Exact endpoints Need verification. |
| BL046 | Web proctoring detects tab switch, blur, devtools, copy/paste, right-click, fullscreen exit, and print screen. | Web | Logs violations to cheating log API. |
| BL047 | Cheating logs persist violation type/count/stats per attempt. | Backend, web | Threshold consequences Need verification. |

## AI, OCR, And File Storage

| ID | Logic | Scope | Sources / Notes |
|---|---|---|---|
| BL050 | File upload flow: client -> gateway -> exam-service -> R2 gRPC -> UserStorage DB record -> AI process-file. | Backend, web | Applies to AI upload/quick-upload. |
| BL051 | AI service processes files via OCR/chunking/embeddings and writes Document/UserStorage status. | Backend Python | Uses shared PostgreSQL. |
| BL052 | Generation flow uploads/selects file, creates async job/history, polls job status, then displays quiz/flashcards. | Backend, web | Web `useAIGeneratorStore`; mobile UI mock-backed. |
| BL053 | Recent uploads and generation history are fetched from `/ai/recent-uploads` and history endpoints. | Backend, web, mobile shared | Mobile UI mock-backed. |
| BL054 | AI chat supports chat CRUD, messages, image upload, multi-document context, and SSE streaming on web. | Backend, web | Mobile shared SSE is stubbed. |
| BL055 | AI model catalog is lazy-loaded and includes embedding/generation models/default model. | Backend, web | Model runtime errors handled in web Axios. |
| BL056 | GenAI tutor knowledge supports folders, files, ingest jobs, graphs, dataset imports, bulk delete/reprocess. | Backend, web | Access restrictions Need verification. |
| BL057 | Uploaded profile/media images use R2 image API. | Backend, web | On record deletion with R2 asset, deletion behavior Needs verification per repo rule. |

## Finance And Subscription

| ID | Logic | Scope | Sources / Notes |
|---|---|---|---|
| BL060 | New user registration triggers wallet creation through event/gRPC-backed finance workflow. | Backend | `user.created` event and wallet gRPC. |
| BL061 | Wallet details include balance and transaction history. | Backend, web, mobile shared | Mobile UI mock-backed. |
| BL062 | Payment creation returns SePay QR/payment data; client polls status. | Backend, web | Web QRPaymentDialog. |
| BL063 | SePay webhook updates payment/wallet/subscription state. | Backend | Webhook protected by API key per scout. |
| BL064 | Subscription benefits are available through finance gRPC `GetUserBenefits`. | Backend | Used by AI chat/subscription checks. |
| BL065 | Web credit utility currently has `FREE_MODE = true`, bypassing client credit checks. | Web | Production behavior Needs decision/verification. Backend checks may still apply. |

## Mobile-Specific Behavior

| ID | Logic | Scope | Sources / Notes |
|---|---|---|---|
| BL070 | Shared KMP repositories for auth, AI, study, exams, history, and account are real Ktor API facades. | Mobile shared | Platform feature UIs mostly not wired. |
| BL071 | Android main feature screens manage local `mutableStateOf` UiState and use hardcoded sample data. | Android | Mock-backed except auth and likely logout. |
| BL072 | iOS main feature screens manage local SwiftUI state and use hardcoded/default data. | iOS | Mock-backed except auth. |
| BL073 | Mobile deep links parse exam session, flashcard, chat, and profile targets. | Mobile shared/platform | Actual navigation handling beyond auth callback Needs verification. |
| BL074 | Mobile SSE client interfaces exist but Android/iOS actuals throw `NotImplementedError`. | Mobile shared | AI streaming unavailable on mobile. |

## Unknowns To Verify

- Exact `/k` root redirect destination.
- Detailed exam session state transitions and anti-cheating penalty thresholds.
- Whether backend enforces teacher/admin permissions for teacher-only web/mobile flows.
- Whether production credit checks are backend-enforced when web `FREE_MODE = true`.
- Exact mobile wiring plans for shared repositories and SSE.


---

# docs/generated/entities.md

# Entities

Source artifacts: `data-model.md`, `scout-report.md`.


## Entity Reference Strategy

- `MODEL###` from `data-model.md` is the canonical cross-artifact reference for persisted backend models and shared contracts.
- `ENT###` in this file is an auxiliary catalog for readers who want a business-oriented entity index.
- Feature specs, API maps, behavior logic, and flows should prefer `MODEL###`; when needed, this catalog maps `ENT###` to the closest canonical `MODEL###`.

## ENT to MODEL Mapping

| ENT | Canonical MODEL | Entity |
|---|---|---|
| ENT001 | MODEL001 | User |
| ENT002 | MODEL002 | UserSession |
| ENT003 | MODEL003 | VerifyAccountCode |
| ENT004 | MODEL004 | ResetPasswordCode |
| ENT005 | MODEL006 | Wallet |
| ENT006 | MODEL007 | WalletTransaction |
| ENT007 | MODEL008 | Payment |
| ENT008 | MODEL009 | UserSubscription |
| ENT009 | MODEL010 | QuizSet |
| ENT010 | MODEL012 | QuizQuestion |
| ENT011 | MODEL015 | FlashCardSet |
| ENT012 | MODEL016 | FlashCard |
| ENT013 | MODEL018 | ExamRoom |
| ENT014 | MODEL019 | ExamSession |
| ENT015 | MODEL020 | ExamAttempt |
| ENT016 | MODEL021 | CheatingLog |
| ENT017 | MODEL022 | AIChat |
| ENT018 | MODEL023 | AIChatMessage |
| ENT019 | MODEL024 | AIChatDocument |
| ENT020 | MODEL027 | UserStorage |
| ENT021 | MODEL028 | Document |
| ENT022 | MODEL029 | UserStorageGraph |
| ENT023 | MODEL025 | HistoryGeneratedQuizz |
| ENT024 | MODEL026 | HistoryGeneratedFlashcard |
| ENT025 | Needs verification | SubjectCategory |
| ENT026 | Needs verification | Subject |
| ENT101 | MODEL031 | AuthService proto |
| ENT102 | MODEL032 | WalletService proto |
| ENT103 | MODEL033 | SubscriptionService proto |
| ENT104 | MODEL034 | R2Service proto |
| ENT105 | MODEL035 | OcrService proto |
| ENT106 | MODEL036-MODEL039 | RabbitMQ event payloads |

## Persistent Entities

| Code | Entity | Domain | Storage | Primary Consumers |
|---|---|---|---|---|
| ENT001 | User | Auth/Profile | PostgreSQL Prisma | BE auth, FE auth/profile, mobile auth |
| ENT002 | UserSession | Auth/Session | PostgreSQL Prisma | BE auth, FE Axios/auth store, mobile secure storage |
| ENT003 | VerifyAccountCode | Auth | PostgreSQL Prisma | Account verification |
| ENT004 | ResetPasswordCode | Auth | PostgreSQL Prisma | Forgot/reset password |
| ENT005 | Wallet | Finance | PostgreSQL Prisma | Finance service, web/mobile wallet |
| ENT006 | WalletTransaction | Finance | PostgreSQL Prisma | Payment/history UI |
| ENT007 | Payment | Finance | PostgreSQL Prisma | SePay payment/QR/status |
| ENT008 | UserSubscription | Finance | PostgreSQL Prisma | Subscription benefits/AI quota |
| ENT009 | QuizSet | Learning | PostgreSQL Prisma | Quiz authoring, exams |
| ENT010 | QuizQuestion | Learning | PostgreSQL Prisma | Quiz set/detail/exam attempt |
| ENT011 | FlashCardSet | Learning | PostgreSQL Prisma | Flashcard CRUD/study |
| ENT012 | FlashCard | Learning | PostgreSQL Prisma | Flashcard detail/study |
| ENT013 | ExamRoom | Exam | PostgreSQL Prisma | Teacher room management |
| ENT014 | ExamSession | Exam | PostgreSQL Prisma | Session scheduling/joining |
| ENT015 | ExamAttempt | Exam | PostgreSQL Prisma | Student attempts/scoring/history |
| ENT016 | CheatingLog | Exam Integrity | PostgreSQL Prisma | Proctoring logs/analytics |
| ENT017 | AIChat | AI Chat | PostgreSQL Prisma | Web AI chat |
| ENT018 | AIChatMessage | AI Chat | PostgreSQL Prisma | Web/mobile AI chat |
| ENT019 | AIChatDocument | AI Chat | PostgreSQL Prisma | Multi-document chat context |
| ENT020 | UserStorage | Storage/AI | PostgreSQL + R2 | Uploads/OCR/history |
| ENT021 | Document | AI/RAG | PostgreSQL vector/content | Python AI/RAG/generation |
| ENT022 | UserStorageGraph | AI/GraphRAG | PostgreSQL | Tutor/graph features |
| ENT023 | HistoryGeneratedQuizz | AI History | PostgreSQL | Generated quiz history |
| ENT024 | HistoryGeneratedFlashcard | AI History | PostgreSQL | Generated flashcard history |
| ENT025 | SubjectCategory | Tutor/Subject | PostgreSQL | AI teacher subject selector |
| ENT026 | Subject | Tutor/Subject | PostgreSQL | AI teacher/tutor prompts |

## Contract Entities

| Code | Contract | Kind | Used By |
|---|---|---|---|
| ENT101 | AuthService proto | gRPC | Auth validation/user info/permissions |
| ENT102 | WalletService proto | gRPC | Wallet creation/read/update |
| ENT103 | SubscriptionService proto | gRPC | User benefits/quota |
| ENT104 | R2Service proto | gRPC | Upload/sign/delete/list files |
| ENT105 | OcrService proto | gRPC | PDF OCR processing |
| ENT106 | RabbitMQ event payloads | Event | User/payment/wallet/subscription/exam/OCR events |

## Client-Side Entities

| Code | Entity | Client | Notes |
|---|---|---|---|
| ENT201 | Zustand auth state | Web | user/isAuthenticated/loading/initializing. |
| ENT202 | Store cache entries | Web | TTL map by feature/key. |
| ENT203 | Secure quiz payload | Web/mobile | Encrypted quiz/answer DTOs. |
| ENT204 | KMP SessionTokens | Mobile shared | accessToken/refreshToken/sessionId/deviceId. |
| ENT205 | Mobile UiState structs/classes | Android/iOS | Mostly mock-backed outside auth. |

## Unresolved Questions
- Exact Prisma relation fields and enum definitions require schema-level read.
- Entity code parity with `data-model.md` should be normalized during review.


---

# docs/generated/feature-list.md

# Feature List

Source artifacts: `scout-report.md`, `_session-context.md`, `user-stories.md`.

## F001 - Account Authentication & Session Management
Users register, log in, use Google OAuth/One Tap, refresh sessions, log out, and recover/change passwords across web and mobile.
- User stories: US001, US002, US003
- Screens/routes: `/login`, `/register`, `/forgot-password`, `/reset-password`, mobile auth flows
- APIs: API001
- Entities: MODEL001 User, MODEL002 UserSession, MODEL004 ResetPasswordCode
- Notes: Cookie-first JWT with Bearer fallback on backend; web stores tokens in localStorage/cookies; mobile uses secure storage patterns with iOS KMP storage incomplete.

## F002 - Account Verification & Profile Security
Authenticated users verify accounts, manage profile details, upload avatar/banner media, and manage active devices/sessions.
- User stories: US004, US015
- Screens/routes: `/k/verify`, `/k/profile`, profile/device components, mobile account/profile views
- APIs: API001, API002, API012
- Entities: MODEL001 User, MODEL002 UserSession, MODEL003 VerifyAccountCode

## F003 - Workspace Navigation, Dashboard & Material Access
Authenticated users access the workspace shell, protected routes, recent materials, history summaries, and cached student material lists.
- User stories: US005, US010, US019
- Screens/routes: `/k`, `/k/my-materials`, `/k/history`, `/k/history/exam`, `/k/history/pdf`, mobile home/history/study tabs
- APIs: API006, API009, API010
- Entities: MODEL010 QuizSet, MODEL015 FlashCardSet, MODEL020 ExamAttempt, MODEL027 UserStorage
- Notes: Web is production wired; mobile non-auth screens mostly use mock UiState data.

## F004 - Quiz Set Authoring & Practice Content
Users create quiz sets, manage questions and labels, save generated quiz content, and use quiz material for practice/exam workflows.
- User stories: US006, US008
- Screens/routes: `/k/manage-quiz-set/:id`, quiz set modals/forms, mobile De Thi/teacher screens
- APIs: API003, API010
- Entities: MODEL010 QuizSet, MODEL011 QuizSetLabel, MODEL012 QuizQuestion, MODEL013 DetailsQuizQuestion, MODEL025 HistoryGeneratedQuizz

## F005 - Flashcard Authoring & Study
Users create flashcard sets, manage flashcards and labels, share access, and run flashcard study sessions with progress tracking.
- User stories: US007
- Screens/routes: `/k/flash-card`, `/k/manage-flashcard-set/:id`, `/study-flashcard/:id`, mobile study views
- APIs: API004, API010
- Entities: MODEL015 FlashCardSet, MODEL016 FlashCard, MODEL017 DetailsFlashCard

## F006 - AI File Upload, OCR & Content Generation
Users upload files/images, store them in R2, process them through OCR/RAG pipelines, poll jobs/status, and generate quizzes or flashcards.
- User stories: US008
- Screens/routes: `/k/ai-tool`, recent files/history dialogs, mobile AI tool screens
- APIs: API006, API011, API012, API013
- Entities: MODEL025 HistoryGeneratedQuizz, MODEL026 HistoryGeneratedFlashcard, MODEL027 UserStorage, MODEL028 Document
- Notes: Backend flow spans gateway -> exam-service -> R2 gRPC -> Python AI service -> PostgreSQL; some async processing uses RabbitMQ.

## F007 - AI Chat & Virtual Tutor
Users chat with AI using SSE streaming, selected subjects, images, and attached documents; teachers/admins manage tutor knowledge sources.
- User stories: US009, US018
- Screens/routes: `/k/ai-tool`, `/k/genai-knowledge`, mobile AI chat views
- APIs: API007, API008, API011, API014
- Entities: MODEL022 AIChat, MODEL023 AIChatMessage, MODEL024 AIChatDocument, MODEL027 UserStorage, MODEL028 Document
- Notes: Mobile SSE clients are stubs; teacher/admin authorization for GenAI knowledge needs verification.

## F008 - Exam Room & Session Management
Teachers create rooms and sessions, configure schedules/access/sharing/retake rules, and view room/session analytics.
- User stories: US011, US014
- Screens/routes: `/k/manage-exam-room`, `/k/manage-exam-room/:id`, `/k/manage-exam-room/:id/session/:sessionId`, mobile teacher/exam screens
- APIs: API005
- Entities: MODEL018 ExamRoom, MODEL019 ExamSession, MODEL020 ExamAttempt, MODEL021 CheatingLog

## F009 - Exam Taking, Attempts & Integrity Logging
Students join exam sessions, start/resume attempts, receive secure/encrypted quiz payloads, submit answers, and generate cheating logs from proctoring signals.
- User stories: US012, US013
- Screens/routes: `/exam-session/:id`, `/exam-session/:id/quiz`, mobile My Exams quiz/result states
- APIs: API005, API015
- Entities: MODEL019 ExamSession, MODEL020 ExamAttempt, MODEL021 CheatingLog
- Notes: Standalone web exam routes are not route-guarded and rely on API/session/code access control.

## F010 - Wallet, Payments & Subscription Benefits
Users view wallet details, create/cancel payments, poll payment status, review history, and receive subscription benefits through finance service and gRPC.
- User stories: US016, US017
- Screens/routes: `/k/subscription`, mobile account wallet views
- APIs: API016, API017
- Entities: MODEL006 Wallet, MODEL007 WalletTransaction, MODEL008 Payment, MODEL009 UserSubscription
- Notes: Web `FREE_MODE = true` currently bypasses frontend credit checks; production intent needs verification.

## F011 - Storage, Media & File Lifecycle
The system uploads, signs, lists, and deletes user files/media via R2, while keeping metadata and processed document chunks in the database.
- User stories: US008, US015, US018
- Screens/routes: profile avatar/banner upload, AI upload flows, GenAI knowledge file manager
- APIs: API012, API013
- Entities: MODEL027 UserStorage, MODEL028 Document
- Notes: R2 deletion behavior on data deletion should be verified per product rule.

## F012 - Cross-Platform Mobile Companion
Android and iOS expose mobile versions of auth, AI, study, exams, history, account, wallet, and teacher management using shared KMP API/repository contracts.
- User stories: US019, US020
- Screens/routes: Android `ExamioApp` tabs, iOS `ContentView` TabView, app deep links
- APIs: API001, API003, API004, API005, API006, API009, API010, API016
- Entities: Same backend models via shared KMP DTOs
- Notes: Shared API layer is real; most platform UIs outside auth still need repository wiring. Non-auth deep link completion needs verification.


---

# docs/generated/permissions-matrix.md

# Permissions Matrix

> Note: This matrix is a grouped permission summary. `permissions.md` is the canonical detailed permission catalog (`PERM001`-`PERM040`); this matrix intentionally collapses related detailed permissions into broader capability rows for quick review.


Source artifacts: `permissions.md`, `screen-list.md`, `route-list.md`, `scout-report.md`.

| Code | Capability | Public | Auth User | Owner/Host | Admin/Teacher | System/API Key | Notes |
|---|---|---:|---:|---:|---:|---:|---|
| PERM001 | Landing/legal page access | Yes | Yes | Yes | Yes | No | Public web pages. |
| PERM002 | Register/login/OAuth/password reset | Yes | N/A | N/A | N/A | No | Auth endpoints are public with validation. |
| PERM003 | Current user/session/profile read | No | Yes | Own only | Admin needs verification | No | Uses JWT/cookie/Bearer/session guards. |
| PERM004 | Profile update/avatar/banner upload | No | Yes | Own only | Admin needs verification | No | Media uses R2/image endpoints. |
| PERM005 | Device/session management | No | Yes | Own sessions | Admin needs verification | No | Logout device/all others. |
| PERM006 | Quiz set CRUD | No | Yes | Owner | Admin needs verification | No | Public/shared quiz read may exist; exact routes need verification. |
| PERM007 | Flashcard set CRUD/study/share | Mixed | Yes | Owner | Admin needs verification | No | Standalone study route relies API access checks. |
| PERM008 | Exam room/session management | No | Yes | Host/owner | Teacher/Admin intended | No | TeacherRoute on web currently only checks auth. |
| PERM009 | Exam attempt participation | Mixed | Yes | Attempt owner | Host analytics | No | Join by code/link may be public/API-level. |
| PERM010 | Cheating log creation/read | No | Yes | Attempt owner/log owner | Host analytics | No | Proctoring logs from web hook/API. |
| PERM011 | AI upload/generation/chat | No | Yes | Own uploads/chats | Admin needs verification | No | Benefits/credits checked server-side; frontend FREE_MODE bypasses only client checks. |
| PERM012 | GenAI tutor knowledge management | No | Needs verification | Owner? | Teacher/Admin intended | No | Access rules unclear; web allowed-email/admin behavior needs verification. |
| PERM013 | Wallet/payment/subscription | No | Yes | Own wallet/payment | Admin needs verification | SePay webhook | Webhook protected by API key. |
| PERM014 | R2 storage operations | No | Yes | Own files | Admin needs verification | gRPC internal | Product rule: deleting DB record with R2 asset should delete R2 object too. |
| PERM015 | Service-to-service gRPC auth/wallet/r2/ocr/subscription | No | No | No | No | Internal services | Proto contracts in `libs/common/src/protos`. |
| PERM016 | RabbitMQ events | No | No | No | No | Internal services | Topic exchange `examio.events`. |
| PERM017 | Mobile auth flows | Yes | N/A | N/A | N/A | No | Android/iOS email+OAuth auth real. |
| PERM018 | Mobile non-auth feature data | No | Intended auth | Intended own data | Needs verification | No | Shared API/repo ready; platform UI mostly mock-backed. |

## Unresolved Questions
- Exact teacher/admin role gating for web and backend routes needs verification.
- Public/shared quiz/flashcard/exam access matrix needs route-level confirmation.
- GenAI knowledge manager authorization semantics need verification.

---

# docs/generated/route-list.md

# Route List

Generated: 2026-05-27

## Notes

- Routes are listed from the scout report only; exact controller method signatures and request/response DTOs need code-level verification.
- Gateway public API uses `/api/v1` for proxied domain routes.
- Stable route codes use `ROUTE###`.

Sources: `plans/260527-1951-rebuild-spec/artifacts/scout-report.md` lines 624-761, 828-887, 891-924, 1209-1288.

## Backend Gateway Routes

| Code | Public Route | Target | Auth | Notes |
|---|---|---|---|---|
| ROUTE001 | `GET /health` | gateway | Public | Gateway health |
| ROUTE002 | `GET /status` | gateway | Public | Gateway status |
| ROUTE003 | `GET /api` | gateway | Public | Swagger UI |
| ROUTE004 | `/api/v1/auth/*` | auth-service | Mixed | Auth proxy |
| ROUTE005 | `/api/v1/quizsets/*` | exam-service | Mixed | Quiz set proxy |
| ROUTE006 | `/api/v1/flashcardsets/*` | exam-service | Auth | Flashcard set proxy |
| ROUTE007 | `/api/v1/examrooms/*` | exam-service | Auth | Exam room proxy |
| ROUTE008 | `/api/v1/examsessions/*` | exam-service | Mixed | Exam session proxy |
| ROUTE009 | `/api/v1/examattempts/*` | exam-service | Auth | Exam attempt proxy |
| ROUTE010 | `/api/v1/subjects/*` | exam-service | Public/Mixed | Subject proxy |
| ROUTE011 | `/api/v1/ai/*` | exam-service / AI integration | Auth | AI upload/generation/tutor proxy |
| ROUTE012 | `/api/v1/student/*` | exam-service | Auth | Student materials proxy |
| ROUTE013 | `/api/v1/r2/*` | exam-service | Auth | R2 upload proxy |
| ROUTE014 | `/api/v1/wallet/*` | finance-service | Auth | Wallet proxy |
| ROUTE015 | `/api/v1/payment/*` | finance-service | Auth | Payment proxy |
| ROUTE016 | `/api/v1/webhook/*` | finance-service | API key/external | SePay webhook proxy |

Source: `scout-report.md` lines 628-647.

## Backend Domain Routes

### Auth Service

| Code | Method | Route | Auth | Notes |
|---|---|---|---|---|
| ROUTE017 | POST | `/auth/register` | Public | Register and set cookies |
| ROUTE018 | POST | `/auth/login` | Public | Login and set cookies |
| ROUTE019 | POST | `/auth/logout` | Auth | Clears cookies, deactivates session |
| ROUTE020 | POST | `/auth/refresh` | Public | Refresh access token |
| ROUTE021 | GET | `/auth/me` | Auth | Current user |
| ROUTE022 | POST | `/auth/sendVerificationEmail` | Auth | Send verification code |
| ROUTE023 | POST | `/auth/verifyAccount` | Auth | Verify account |
| ROUTE024 | POST | `/auth/send-code-reset-password` | Public | Send reset code |
| ROUTE025 | POST | `/auth/reset-password` | Public | Reset password |
| ROUTE026 | POST | `/auth/send-code-change-password` | Auth | Send change-password code |
| ROUTE027 | POST | `/auth/change-password` | Auth | Change password |
| ROUTE028 | GET | `/auth/google` | Public | Google OAuth start |
| ROUTE029 | POST | `/auth/google/one-tap` | Public | Google One Tap |
| ROUTE030 | GET | `/auth/google/callback` | Public | OAuth callback |
| ROUTE031 | POST | `/auth/sync-refresh-token` | Auth | Sync refresh token from session |
| ROUTE032 | GET | `/profile/*` | Auth | Profile routes, exact subroutes need verification |

Source: `scout-report.md` lines 649-669.

### Exam Service

| Code | Method | Route | Auth | Notes |
|---|---|---|---|---|
| ROUTE033 | POST/GET | `/quizsets` | Auth / some public | Quiz set create/list |
| ROUTE034 | GET/PUT/DELETE | `/quizsets/:id` | Auth / some public | Quiz set detail/update/delete |
| ROUTE035 | GET/POST | `/quizsets/:id/questions` | Auth | Quiz questions |
| ROUTE036 | POST | `/quizsets/:id/questions/:qId/label` | Auth | Assign label |
| ROUTE037 | GET/POST | `/flashcardsets` | Auth | Flashcard set list/create |
| ROUTE038 | GET/PUT/DELETE | `/flashcardsets/:id` | Auth | Flashcard set detail/update/delete |
| ROUTE039 | POST | `/flashcardsets/:id/flashcards` | Auth | Add flashcards |
| ROUTE040 | POST/GET | `/examrooms` | Auth | Exam room create/list |
| ROUTE041 | POST | `/examsessions` | Auth | Create exam session |
| ROUTE042 | GET | `/examsessions` | Auth | List exam sessions |
| ROUTE043 | PUT | `/examsessions/:id` | Auth | Update exam session |
| ROUTE044 | POST | `/examsessions/:id/start` | Auth | Start session |
| ROUTE045 | POST | `/examsessions/:id/verify-code` | Public/code | Access-code validation |
| ROUTE046 | POST | `/examsessions/:id/sharing` | Auth | Sharing settings |
| ROUTE047 | POST | `/examsessions/:id/join` | Public/code | Join by code/link |
| ROUTE048 | POST/PUT | `/examattempts` | Auth | Attempt start/update |
| ROUTE049 | POST | `/cheatinglog` | Auth | Cheating violation logging |
| ROUTE050 | POST | `/flashcard-study/progress` | Auth | Study progress |
| ROUTE051 | POST | `/flashcard-study/submit-answer` | Auth | Study answer submission |
| ROUTE052 | GET | `/subjects` | Public | Subject list |
| ROUTE053 | POST | `/r2/*` | Auth | File/image upload via R2 |

Source: `scout-report.md` lines 670-725.

### Exam Service AI/Tutor Routes

| Code | Method | Route | Auth | Notes |
|---|---|---|---|---|
| ROUTE054 | POST | `/ai/quick-upload` | Auth | Quick file upload |
| ROUTE055 | POST | `/ai/generate-from-file` | Auth | Generate quiz/flashcards from upload |
| ROUTE056 | POST | `/ai/upload` | Auth | File upload |
| ROUTE057 | POST | `/ai/upload-image` | Auth | Image upload |
| ROUTE058 | GET | `/ai/recent-uploads` | Auth | Recent uploads |
| ROUTE059 | GET | `/ai/models` | Auth | AI model catalog |
| ROUTE060 | GET | `/ai/upload/:uploadId` | Auth | Upload detail |
| ROUTE061 | DELETE | `/ai/upload/:uploadId` | Auth | Delete upload |
| ROUTE062 | POST | `/ai/regenerate/:uploadId` | Auth | Regenerate output |
| ROUTE063 | GET | `/ai/job/:jobId` | Auth | Job status |
| ROUTE064 | DELETE | `/ai/job/:jobId` | Auth | Cancel/delete job |
| ROUTE065 | GET | `/ai/upload/:uploadId/history` | Auth | Generated history |
| ROUTE066 | POST | `/ai/tutor/ingest` | Auth | Tutor ingest |
| ROUTE067 | GET | `/ai/tutor/ingest` | Auth | List ingest jobs |
| ROUTE068 | GET | `/ai/tutor/ingest/:jobId` | Auth | Ingest job detail |
| ROUTE069 | POST/GET | `/ai/tutor/knowledge-files` | Auth | Create/list knowledge files |
| ROUTE070 | GET | `/ai/tutor/knowledge-files/search` | Auth | Search knowledge files |
| ROUTE071 | GET | `/ai/tutor/knowledge-files/:fileId/graph` | Auth | Knowledge graph |
| ROUTE072 | POST | `/ai/tutor/knowledge-files/bulk-delete` | Auth | Bulk delete |
| ROUTE073 | POST | `/ai/tutor/knowledge-files/bulk-reprocess` | Auth | Bulk reprocess |
| ROUTE074 | POST/GET | `/ai/tutor/knowledge-folders` | Auth | Create/list folders |
| ROUTE075 | PUT/DELETE | `/ai/tutor/knowledge-folders/:folderId` | Auth | Update/delete folder |
| ROUTE076 | GET | `/ai/tutor/knowledge-stats` | Auth | Knowledge stats |
| ROUTE077 | POST/GET | `/ai/tutor/dataset-imports` | Auth | Dataset import management |
| ROUTE078 | GET | `/ai/tutor/dataset-imports/catalog` | Auth | Dataset catalog |
| ROUTE079 | GET | `/ai/tutor/dataset-imports/:jobId` | Auth | Import status |
| ROUTE080 | POST | `/ai/tutor/dataset-imports/:jobId/cancel` | Auth | Cancel import |
| ROUTE081 | POST | `/ai/tutor/dataset-imports/:datasetKey/clear` | Auth | Clear imported dataset |

Source: `scout-report.md` lines 689-719.

### Finance Service

| Code | Method | Route | Auth | Notes |
|---|---|---|---|---|
| ROUTE082 | GET | `/wallet/info` | Auth | Wallet summary |
| ROUTE083 | GET | `/wallet/details` | Auth | Wallet + transactions |
| ROUTE084 | POST | `/payment/create` | Auth | Create payment / QR |
| ROUTE085 | GET | `/payment/status/:paymentId` | Auth | Payment status |
| ROUTE086 | GET | `/payment/history` | Auth | Payment history |
| ROUTE087 | DELETE | `/payment/cancel/:paymentId` | Auth | Cancel pending payment |
| ROUTE088 | POST | `/webhook/sepay` | API key | SePay webhook |

Source: `scout-report.md` lines 727-738.

### Python AI Service

| Code | Method | Route | Notes |
|---|---|---|---|
| ROUTE089 | GET | `/` | Health check |
| ROUTE090 | GET | `/health` | Health check |
| ROUTE091 | POST | `/api/chat/query` | Stateless AI query |
| ROUTE092 | POST | `/api/chat/stream` | SSE streaming query |
| ROUTE093 | GET | `/api/chat/health` | Chat health |
| ROUTE094 | POST | `/api/ai/process-file` | OCR + embeddings |
| ROUTE095 | POST | `/api/ai/query-file` | Query file content |
| ROUTE096 | POST | `/api/ai/multi-query` | Multi-query file |
| ROUTE097 | GET | `/api/ai/file-status/{id}` | File status |
| ROUTE098 | GET | `/api/ai/models` | Model catalog |
| ROUTE099 | GET | `/api/ai/graph-stats/{id}` | GraphRAG stats |
| ROUTE100 | POST | `/api/ai/extract-entities/{id}` | Extract entities |
| ROUTE101 | GET | `/api/ai/entities/{id}` | Entity list |
| ROUTE102 | DELETE | `/api/ai/clear-cache/{id}` | Clear retriever cache |
| ROUTE103 | POST | `/api/generate/quiz` | Generate quiz |
| ROUTE104 | POST | `/api/generate/flashcards` | Generate flashcards |
| ROUTE105 | GET | `/api/generate/quiz/{history_id}` | Generated quiz history |
| ROUTE106 | GET | `/api/generate/flashcards/{history_id}` | Generated flashcard history |
| ROUTE107 | Various | `/api/tutor/*` | Tutor knowledge endpoints; exact list in AI service section |

Sources: `scout-report.md` lines 255-314, 739-761.

## Web Frontend Routes

| Code | Path | Page | Guard/Layout |
|---|---|---|---|
| ROUTE108 | `/` | `HomePage` | PublicLayout |
| ROUTE109 | `/about` | `AboutPage` | PublicLayout |
| ROUTE110 | `/contact` | `ContactPage` | PublicLayout |
| ROUTE111 | `/terms` | `TermsPage` | PublicLayout |
| ROUTE112 | `/privacy` | `PrivacyPage` | PublicLayout |
| ROUTE113 | `/cookies` | `CookiesPage` | PublicLayout |
| ROUTE114 | `/security` | `SecurityPage` | PublicLayout |
| ROUTE115 | `/login` | `LoginPage` | PublicRoute/AuthLayout |
| ROUTE116 | `/register` | `RegisterPage` | PublicRoute/AuthLayout |
| ROUTE117 | `/forgot-password` | `ForgotPasswordPage` | PublicRoute/AuthLayout |
| ROUTE118 | `/reset-password` | `ResetPasswordPage` | PublicRoute/AuthLayout |
| ROUTE119 | `/k` | `KRootRedirect` | ProtectedRoute/KLayout |
| ROUTE120 | `/k/profile` | `ProfilePage` | ProtectedRoute/KLayout |
| ROUTE121 | `/k/verify` | `VerifyPage` | ProtectedRoute/KLayout |
| ROUTE122 | `/k/subscription` | `SubscriptionPage` | ProtectedRoute/KLayout |
| ROUTE123 | `/k/my-materials` | `MyMaterialsPage` | ProtectedRoute/KLayout |
| ROUTE124 | `/k/flash-card` | `FlashcardsPage` | ProtectedRoute/KLayout |
| ROUTE125 | `/k/history` | `HistoryPage` | ProtectedRoute/KLayout |
| ROUTE126 | `/k/history/exam` | `ExamHistoryPage` | ProtectedRoute/KLayout |
| ROUTE127 | `/k/history/pdf` | `PDFHistoryPage` | ProtectedRoute/KLayout |
| ROUTE128 | `/k/manage-exam` | `ManageExamPage` | ProtectedRoute/KLayout |
| ROUTE129 | `/k/manage-quiz-set/:id` | `ManageQuizSetDetailPage` | ProtectedRoute/KLayout |
| ROUTE130 | `/k/manage-flashcard-set/:id` | `ManageFlashcardSetDetailPage` | ProtectedRoute/KLayout |
| ROUTE131 | `/k/ai-tool` | `AIToolPage` | ProtectedRoute/KLayout |
| ROUTE132 | `/k/genai-knowledge` | `GenAIKnowledgePage` | ProtectedRoute/KLayout |
| ROUTE133 | `/k/manage-exam-room` | `ManageExamRoomPage` | ProtectedRoute/KLayout |
| ROUTE134 | `/k/manage-exam-room/:id` | `ManageExamRoomDetailPage` | ProtectedRoute/KLayout |
| ROUTE135 | `/k/manage-exam-room/:id/session/:sessionId` | `ExamRoomSessionAnalyticsPage` | ProtectedRoute/KLayout |
| ROUTE136 | `/k/my-exams` | `MyExamsPage` | ProtectedRoute/KLayout |
| ROUTE137 | `/study-flashcard/:id` | `FlashcardStudyPage` | No route guard |
| ROUTE138 | `/exam-session/:id` | `ExamSessionPage` | No route guard |
| ROUTE139 | `/exam-session/:id/quiz` | `ExamQuizPage` | No route guard |

Source: `scout-report.md` lines 852-887.

## Web API Client Coverage

| Code | API Client | Backend Base | Purpose |
|---|---|---|---|
| ROUTE140 | `authApi.ts` | `/auth/*` | Auth lifecycle |
| ROUTE141 | `subjectApi.ts` | `/subjects/*` | Subjects/categories |
| ROUTE142 | `examApi.ts` | `/ai/generate-from-file` | AI exam generation |
| ROUTE143 | `examRoomApi.ts` | `/examrooms/*` | Exam rooms |
| ROUTE144 | `examSessionApi.ts` | `/examsessions/*` | Sessions/access/sharing/stats |
| ROUTE145 | `examAttemptApi.ts` | `/examattempts/*` | Attempts/progress/secure quiz |
| ROUTE146 | `flashcardSetApi.ts` | `/flashcardsets/*` | Flashcard sets/cards/labels |
| ROUTE147 | `flashcardStudyApi.ts` | `/flashcard-study/*` | Study progress/review |
| ROUTE148 | `quizsetApi.ts` | `/quizsets/*` | Quiz sets/questions/labels |
| ROUTE149 | `aiApi.ts` | `/ai/*` | Uploads/jobs/models/regenerate |
| ROUTE150 | `aiChatApi.ts` | `/ai-chat/*` | Chat CRUD/messages/SSE |
| ROUTE151 | `virtualTeacherApi.ts` | `/virtual-teacher/*` | Legacy teacher chat/upload; backend coverage needs verification |
| ROUTE152 | `genaiTutorKnowledgeApi.ts` | `/ai/tutor/knowledge-*` | Knowledge folders/files/stats/datasets |
| ROUTE153 | `historyApi.ts` | `/examattempts/history-stats`, `/ai/recent-uploads` | History |
| ROUTE154 | `studentMaterialsApi.ts` | `/student/*` | Recent materials/pin/share |
| ROUTE155 | `profileApi.ts` | `/profile/*` | Profile/avatar/banner |
| ROUTE156 | `subscriptionApi.ts` | `/wallet/*`, `/payment/*` | Wallet/payment/subscription |
| ROUTE157 | `mediaApi.ts` | `/r2/image` | Generic image upload |
| ROUTE158 | `devicesApi.ts` | `/devices/*` | Device/session management; gateway route needs verification |
| ROUTE159 | `cheatingLogApi.ts` | `/cheatinglogs/*` | Cheating logs; singular/plural backend route needs verification |

Source: `scout-report.md` lines 891-924.

## Mobile Route/API Coverage

Mobile has simple local navigation rather than route URLs. Shared KMP endpoint constants and API services cover:

| Code | Mobile Area | Backend Base | Status |
|---|---|---|---|
| ROUTE160 | Auth | `/auth/login`, `/auth/me`, reset/refresh/logout | Real shared API; platform auth flows wired |
| ROUTE161 | Profile/account | `/profile`, `/wallet/details`, `/payment/subscription/plans` | Shared API ready; UI partly mock/local |
| ROUTE162 | AI chat/generator | `/ai/chats`, `/ai/chat`, `/ai/recent-uploads`, `/ai/generate-from-file`, `/subjects` | Shared API ready; platform UI mock; SSE stub |
| ROUTE163 | Study | `/flashcardsets`, `/student/materials/` | Shared API ready; platform UI mock |
| ROUTE164 | Exams | `/quizsets`, `/examrooms`, `/examattempts` | Shared API ready; platform UI mock |
| ROUTE165 | History | `/examattempts/history-stats`, `/ai/recent-uploads`, `/examattempts/list` | Shared API ready; platform UI mock |
| ROUTE166 | Deep links | `examio://auth`, `examio://...` parsed to exam/flashcard/chat/profile | Auth callback real; feature deep-link behavior needs verification |

Sources: `scout-report.md` lines 1209-1288, 1311-1323, 1408-1412, 1440-1459, 1464-1488.

## Needs Verification

- Exact backend route names for web `/ai-chat/*`, `/virtual-teacher/*`, `/devices/*`, and plural `/cheatinglogs/*` versus scout backend route list.
- Exact auth requirements for quiz/subject routes marked mixed or some public.
- Exact request/response DTOs for all routes.
- Mobile shared endpoint constants should be checked against gateway routes before implementation.


---

# docs/generated/screen-flow.md

# Screen Flow

Generated: 2026-05-27
Source: scout reports. Unknowns are marked `Needs verification`.

## Web Flow

### Public And Auth Entry

| Flow | Steps | Screens | Notes |
|---|---|---|---|
| FLW001 | Public visitor opens landing/legal pages | SCR001-SCR007 | PublicLayout with header/footer and Google One Tap. |
| FLW002 | User logs in with credentials | SCR008 -> SCR012 | PublicRoute redirects authenticated users to workspace. Token/cookie sync handled by auth store + Axios. |
| FLW003 | User registers | SCR009 -> SCR012 | Backend sets auth cookies/tokens; wallet creation is backend event/gRPC-backed. |
| FLW004 | User resets password | SCR010 -> SCR011 -> SCR008 | Reset code flow. Exact success redirect Needs verification. |
| FLW005 | User logs in with Google OAuth | SCR008/PublicLayout -> backend OAuth -> useAuthSync -> SCR012 | OAuth tokens returned in URL query params, then stripped from URL. |
| FLW006 | Authenticated user accesses public auth page | SCR008-SCR011 -> SCR012 | PublicRoute sends authenticated users to `/k`. |

### Workspace Shell

| Flow | Steps | Screens | Notes |
|---|---|---|---|
| FLW010 | Authenticated workspace navigation | SCR012 -> SCR013-SCR029 | KLayout supplies sidebar/header/search/theme/verification banner/pending job dialog. |
| FLW011 | Unauthenticated user accesses workspace | SCR013-SCR029 -> SCR008 | ProtectedRoute stores return target. |
| FLW012 | User session expires | Any API-backed screen -> token refresh -> continue or SCR008 | Axios interceptor retries refresh once via singleton promise. |
| FLW013 | User verifies account | SCR014 -> SCR012 or prior workspace page | Exact post-verification route Needs verification. |

### Learning Content

| Flow | Steps | Screens | Notes |
|---|---|---|---|
| FLW020 | Manage quiz sets | SCR021 -> create/edit -> SCR022 | Quiz set CRUD, questions, labels, export. |
| FLW021 | Manage flashcard sets | SCR017 -> create/edit -> SCR023 | Flashcard set CRUD, cards, labels, sharing. |
| FLW022 | Study flashcards | SCR017/SCR016/SCR023 -> SCR030 | Standalone route; route has no guard, relies on API access checks. |
| FLW023 | View student materials | SCR016 -> SCR030 or SCR031 | Recent flashcards/exams and pin/share behavior. Exact navigation Needs verification. |

### Exam Room And Exam Taking

| Flow | Steps | Screens | Notes |
|---|---|---|---|
| FLW030 | Teacher manages exam rooms | SCR026 -> SCR027 -> SCR028 | Room CRUD, sessions, analytics. Teacher-only enforcement Needs verification. |
| FLW031 | Student views available exams | SCR029 -> SCR031 | Workspace list to standalone session entry. |
| FLW032 | Join exam by access code/link | SCR031 -> verify/join -> SCR032 | Session route is unguarded; API validates access code/link/whitelist. |
| FLW033 | Take secure quiz | SCR032 -> answer/update progress -> submit -> result | Uses secure quiz payload, reCAPTCHA, proctoring hook, cheating logs. |
| FLW034 | Proctoring event occurs | SCR032 -> cheating log API -> continue/end depending rule | Exact thresholds and lockout behavior Need verification. |

### AI And Knowledge

| Flow | Steps | Screens | Notes |
|---|---|---|---|
| FLW040 | Generate quiz/flashcards from file | SCR024 -> upload -> job polling -> result/history | AI generation store manages jobs, credits, recent uploads. |
| FLW041 | View PDF/generation history | SCR024/SCR020 -> generated result/detail | Exact detail routes Need verification. |
| FLW042 | Use AI chat/teacher | SCR024 or related chat UI -> stream messages | SSE client exists on web through aiChatApi. Exact route composition Needs verification. |
| FLW043 | Manage GenAI knowledge | SCR025 -> folders/files/upload/import/graph | Protected route; allowed-email/admin rules Need verification. |

### Account And Billing

| Flow | Steps | Screens | Notes |
|---|---|---|---|
| FLW050 | Edit profile | SCR013 -> save -> profile API | Avatar/banner upload goes through R2 image API. |
| FLW051 | Manage devices | SCR013 -> device list/logout | Device API and session invalidation. |
| FLW052 | Buy credits/subscription | SCR015 -> create payment -> QR dialog -> poll status -> wallet refresh | Payment via SePay; webhook updates payment/wallet/subscription. |
| FLW053 | View history | SCR018 -> SCR019/SCR020 | History overview branches to exam/PDF history. |

## Android Flow

| Flow | Steps | Screens | Backing |
|---|---|---|---|
| FLW101 | Launch unauthenticated | SCR101 -> SCR102 | API-backed auth. |
| FLW102 | Register or reset password | SCR101 -> SCR103/SCR104/SCR105 | API-backed auth. |
| FLW103 | Google OAuth | SCR102 -> system browser -> `examio://auth/callback` -> SCR106 | API-backed auth. |
| FLW104 | Launch authenticated | AuthRepository.restoreSession -> SCR106 | API-backed session restore. |
| FLW105 | Main tab navigation | SCR106 -> SCR108/SCR112/SCR110/SCR111/SCR113 | Platform feature screens mock-backed. |
| FLW106 | Profile sheet/logout | SCR106 -> SCR115 -> auth logout -> SCR101 | Auth/logout likely API-backed; sheet data Needs verification. |
| FLW107 | AI tool/chat | SCR108/SCR109 local state only | Mock-backed UI; shared AI APIs ready but not wired. |
| FLW108 | Exam/flashcard/history/account actions | SCR110-SCR114 local state only | Mock-backed UI; shared repositories ready for most domains. |

## iOS Flow

| Flow | Steps | Screens | Backing |
|---|---|---|---|
| FLW201 | Launch unauthenticated | SCR201 -> SCR202 | API-backed auth through URLSession client. |
| FLW202 | Register or reset password | SCR201 -> SCR203/SCR204/SCR205 | API-backed auth. |
| FLW203 | Google OAuth | SCR202 -> system browser -> `examio://auth/callback` -> SCR206 | API-backed auth with Keychain persistence. |
| FLW204 | Launch authenticated | AuthViewModel token restore Needs verification -> SCR206 | Token persistence exists; restore semantics Need verification. |
| FLW205 | Main tab navigation | SCR206 -> SCR207-SCR212 | Feature screens mock-backed. |
| FLW206 | AI/study/exam/account/teacher actions | SCR208-SCR212 local state only | Mock-backed UI; shared KMP APIs not generally used by iOS screens except auth has private URLSession client. |

## Cross-Platform Parity Notes

- Web is the most complete API-backed client.
- Mobile auth is API-backed on both platforms.
- Mobile Android/iOS feature screens for AI, study, exams, history, account, and teacher are mostly mock-backed; shared KMP repositories exist but are not wired into platform UI.
- Mobile SSE streaming is not functional: shared platform implementations throw `NotImplementedError`.


---

# docs/generated/screen-list.md

# Screen List

Generated: 2026-05-27
Source: scout reports. Unknowns are marked `Needs verification`.

## Web Frontend Screens

| ID | Route | Screen/Page | Auth | Notes |
|---|---|---|---|---|
| SCR001 | `/` | Home / Landing | Public | Public marketing layout. |
| SCR002 | `/about` | About | Public | Public legal/marketing page. |
| SCR003 | `/contact` | Contact | Public | Public contact page. |
| SCR004 | `/terms` | Terms | Public | Public legal page. |
| SCR005 | `/privacy` | Privacy | Public | Public legal page. |
| SCR006 | `/cookies` | Cookies | Public | Public legal page. |
| SCR007 | `/security` | Security | Public | Public legal/security page. |
| SCR008 | `/login` | Login | PublicRoute | Redirects authenticated users to `/k`. Google OAuth/One Tap supported. |
| SCR009 | `/register` | Register | PublicRoute | Registration form. |
| SCR010 | `/forgot-password` | Forgot Password | PublicRoute | Sends reset code. |
| SCR011 | `/reset-password` | Reset Password | PublicRoute | Code + new password. |
| SCR012 | `/k` | Workspace Root Redirect | ProtectedRoute | Redirect target after auth; exact destination Needs verification. |
| SCR013 | `/k/profile` | Profile | ProtectedRoute | Profile form, devices, password change. |
| SCR014 | `/k/verify` | Verify Account | ProtectedRoute | Email verification. |
| SCR015 | `/k/subscription` | Subscription / Wallet | ProtectedRoute | Wallet, subscription plans, QR payment, transactions. |
| SCR016 | `/k/my-materials` | My Materials | ProtectedRoute | Recent student materials. |
| SCR017 | `/k/flash-card` | Flashcards | ProtectedRoute | Flashcard set CRUD/search/filter. |
| SCR018 | `/k/history` | History Overview | ProtectedRoute | Stats and recent activity. |
| SCR019 | `/k/history/exam` | Exam History | ProtectedRoute | Attempt history. |
| SCR020 | `/k/history/pdf` | PDF History | ProtectedRoute | Upload/generation history. |
| SCR021 | `/k/manage-exam` | Manage Exams / Quiz Sets | ProtectedRoute | Quiz set CRUD. |
| SCR022 | `/k/manage-quiz-set/:id` | Manage Quiz Set Detail | ProtectedRoute | Questions, labels, editor/export. |
| SCR023 | `/k/manage-flashcard-set/:id` | Manage Flashcard Set Detail | ProtectedRoute | Cards, labels, editor/export. |
| SCR024 | `/k/ai-tool` | AI Tool | ProtectedRoute | AI generation, recent files, job polling. |
| SCR025 | `/k/genai-knowledge` | GenAI Knowledge | ProtectedRoute | Tutor knowledge folders/files/datasets/graphs. Access rules Needs verification. |
| SCR026 | `/k/manage-exam-room` | Manage Exam Rooms | ProtectedRoute | Exam room CRUD. |
| SCR027 | `/k/manage-exam-room/:id` | Exam Room Detail | ProtectedRoute | Sessions under room. |
| SCR028 | `/k/manage-exam-room/:id/session/:sessionId` | Session Analytics | ProtectedRoute | Analytics for exam room session. |
| SCR029 | `/k/my-exams` | My Exams | ProtectedRoute | Student exam list. |
| SCR030 | `/study-flashcard/:id` | Flashcard Study | API-level | Standalone, no route guard. Access via API. |
| SCR031 | `/exam-session/:id` | Exam Session Entry | API-level/public-code | Standalone, verifies code/link/access. |
| SCR032 | `/exam-session/:id/quiz` | Exam Quiz | API-level | Standalone secure quiz/proctoring flow. |

## Web Layout / Shell Regions

| ID | Region | Notes |
|---|---|---|
| REG001 | PublicLayout | Header, footer, Google One Tap for public pages. |
| REG002 | AuthLayout | Minimal shell for auth forms. |
| REG003 | KLayout | Authenticated workspace sidebar/header/search/theme/verification banner/pending job dialog. |
| REG004 | Standalone Study/Exam Shell | No global layout for SCR030-SCR032. |

## Android Mobile Screens

| ID | Screen | Backing | Notes |
|---|---|---|---|
| SCR101 | AuthNavGraph | API-backed | Local enum router for login/register/forgot/reset/OAuth callback. |
| SCR102 | LoginScreen | API-backed | Calls shared AuthRepository; Google OAuth via browser callback. |
| SCR103 | RegisterScreen | API-backed | Calls shared AuthRepository. |
| SCR104 | ForgotPasswordScreen | API-backed | Calls shared AuthRepository. |
| SCR105 | ResetPasswordScreen | API-backed | Calls shared AuthRepository. |
| SCR106 | Main Tab Shell | Mixed | Scaffold + header + bottom tabs; auth-backed shell. |
| SCR107 | HomeScreen | Mock-backed, unused | Dashboard UI exists but not wired in main tab selection. |
| SCR108 | AiScreen | Mock-backed | Teacher chat/tool/history sections; shared AI repository exists but UI not wired. |
| SCR109 | AIToolScreen | Mock-backed | PDF upload/generation UI. |
| SCR110 | MyExamsScreen | Mock-backed | List/detail/quiz/result states. |
| SCR111 | DeThiScreen | Mock-backed | Exam set management, stats, create FAB. |
| SCR112 | StudyScreen | Mock-backed | Material list and flashcard study. |
| SCR113 | LichSuScreen | Mock-backed | Stats and activity list. |
| SCR114 | AccountScreen | Mock-backed UI, API-ready repository | Profile/wallet/teacher/settings sections. Actual repository wiring Needs verification. |
| SCR115 | ProfileSheet | Mixed | Logout/profile sheet; auth interaction likely real, other data Needs verification. |
| SCR116 | TeacherScreen | Mock-backed | Content management UI; not wired. |

## iOS Mobile Screens

| ID | Screen | Backing | Notes |
|---|---|---|---|
| SCR201 | AuthFlowView | API-backed | SwiftUI NavigationStack for auth flow. |
| SCR202 | LoginView | API-backed | URLSession AuthApiClient + KeychainTokenStore, Google OAuth. |
| SCR203 | RegisterView | API-backed | URLSession AuthApiClient. |
| SCR204 | ForgotPasswordView | API-backed | URLSession AuthApiClient. |
| SCR205 | ResetPasswordView | API-backed | URLSession AuthApiClient. |
| SCR206 | Main Tab Shell | Mixed | TabView + AppHeader + ProfileSheet after auth. |
| SCR207 | HomeView | Mock-backed | Empty dashboard/default stats. |
| SCR208 | AiView | Mock-backed | Teacher chat/tool/history segmented view. |
| SCR209 | StudyView | Mock-backed | Material list and flashcard study. |
| SCR210 | MyExamsView | Mock-backed | Attempts/detail/quiz/result states. |
| SCR211 | AccountView | Mock-backed | Profile/wallet/teacher/settings sections. |
| SCR212 | TeacherView | Mock-backed | Teacher content management. |
| SCR213 | PlaceholderScreen | Mock/placeholder | Generic placeholder. |

## Mobile Shared API Equivalents

| Web Area | Mobile Equivalent | Shared API Status |
|---|---|---|
| Auth | SCR101-SCR105, SCR201-SCR205 | API-backed. |
| AI Chat/Tool | SCR108-SCR109, SCR208 | Shared API ready; platform UI mock-backed. SSE stubbed. |
| Flashcards/Study | SCR112, SCR209 | Shared API ready; platform UI mock-backed. |
| Exams/Quiz Sets/Attempts | SCR110-SCR111, SCR210 | Shared API ready; platform UI mock-backed. |
| History | SCR113 | Shared API ready; platform UI mock-backed. iOS API backing Needs verification. |
| Account/Wallet | SCR114-SCR115, SCR211 | Shared API ready; platform UI mostly mock-backed except auth/logout. |
| Teacher Management | SCR116, SCR212 | Not wired / mock-backed; teacher API coverage Needs verification. |


---

# docs/generated/user-stories.md

# User Stories

Source artifacts: `scout-report.md`, `_session-context.md`.

## Public Visitor & Account Access

### US001 - Create an account
As a visitor, I want to register with email/password or Google OAuth so that I can access Examio learning features.
- References: routes `/register`, `/api/v1/auth/register`, `/api/v1/auth/google`; entities MODEL001 User, MODEL002 UserSession.

### US002 - Sign in and keep my session active
As a user, I want to log in, refresh my session, and be redirected back to my intended page so that I can continue working without repeated sign-ins.
- References: routes `/login`, `/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/sync-refresh-token`; entities MODEL001 User, MODEL002 UserSession.

### US003 - Recover or change my password
As a user, I want to request reset/change codes and set a new password so that I can regain or secure account access.
- References: routes `/forgot-password`, `/reset-password`, `/api/v1/auth/send-code-reset-password`, `/api/v1/auth/reset-password`, `/api/v1/auth/change-password`; entities MODEL004 ResetPasswordCode.

### US004 - Verify my account
As an authenticated user, I want to receive and submit an account verification code so that my account becomes verified.
- References: routes `/k/verify`, `/api/v1/auth/sendVerificationEmail`, `/api/v1/auth/verifyAccount`; entities MODEL003 VerifyAccountCode.

## Learner Workspace

### US005 - Manage my learning materials
As a learner, I want to view recent flashcards and exams, pin materials, and access shared links so that I can quickly resume study.
- References: route `/k/my-materials`, `/api/v1/student/*`; entities MODEL010 QuizSet, MODEL014 FlashCardSet.

### US006 - Create and organize quiz sets
As a learner or teacher, I want to create quiz sets, add questions, assign labels, and share access so that quizzes can be reused for practice and exams.
- References: routes `/k/manage-quiz-set/:id`, `/api/v1/quizsets/*`; entities MODEL010 QuizSet, MODEL011 QuizSetLabel, MODEL012 QuizQuestion.

### US007 - Create and study flashcard sets
As a learner or teacher, I want to create flashcard sets, edit cards, organize labels, and run study sessions so that I can practice spaced recall.
- References: routes `/k/flash-card`, `/study-flashcard/:id`, `/api/v1/flashcardsets/*`, `/api/v1/flashcard-study/*`; entities MODEL014 FlashCardSet, MODEL015 FlashCard.

### US008 - Generate learning content from uploaded files
As a learner, I want to upload PDFs/images and generate quizzes or flashcards from processed document content so that I can turn materials into study assets.
- References: route `/k/ai-tool`, `/api/v1/ai/quick-upload`, `/api/v1/ai/generate-from-file`, Python `/api/generate/*`; entities MODEL024 UserStorage, MODEL025 Document, MODEL021 HistoryGeneratedQuizz, MODEL022 HistoryGeneratedFlashcard.

### US009 - Chat with an AI tutor
As a learner, I want to chat with an AI teacher using selected subjects and attached documents so that I can get contextual learning support.
- References: route `/k/ai-tool`, `/api/v1/ai-chat/*`, Python `/api/chat/stream`; entities MODEL018 AIChat, MODEL019 AIChatMessage, MODEL020 AIChatDocument, MODEL024 UserStorage.

### US010 - Review learning history
As a learner, I want to view PDF, generation, and exam history so that I can track past activity.
- References: routes `/k/history`, `/k/history/exam`, `/k/history/pdf`, `/api/v1/examattempts/history-stats`, `/api/v1/ai/recent-uploads`; entities MODEL017 ExamAttempt, MODEL021 HistoryGeneratedQuizz, MODEL022 HistoryGeneratedFlashcard, MODEL024 UserStorage.

## Exams & Assessment

### US011 - Manage exam rooms and sessions
As a teacher, I want to create exam rooms and sessions with access rules, schedules, question selection, and sharing settings so that students can take controlled assessments.
- References: routes `/k/manage-exam-room`, `/k/manage-exam-room/:id`, `/api/v1/examrooms/*`, `/api/v1/examsessions/*`; entities MODEL016 ExamRoom, MODEL017 ExamSession.

### US012 - Join and take an exam session
As a student, I want to join an exam session by link/code, answer secure questions, and submit my attempt so that my score is recorded.
- References: routes `/exam-session/:id`, `/exam-session/:id/quiz`, `/api/v1/examsessions/:id/join`, `/api/v1/examattempts/*`; entities MODEL017 ExamSession, MODEL018 ExamAttempt.

### US013 - Monitor exam integrity
As a teacher or system, I want exam attempts to record tab switches, window blur, devtools, and other violations so that integrity risks are visible.
- References: frontend hook `useCheatingDetection`, `/api/v1/cheatinglog` or `/api/v1/cheatinglogs/*`; entities MODEL019 CheatingLog.

### US014 - Analyze exam room sessions
As a teacher, I want to view exam room/session analytics and logs so that I can evaluate outcomes and suspicious behavior.
- References: route `/k/manage-exam-room/:id/session/:sessionId`, `/api/v1/examsessions/*`, `/api/v1/cheatinglogs/*`; entities MODEL016 ExamRoom, MODEL017 ExamSession, MODEL018 ExamAttempt, MODEL019 CheatingLog.

## Profile, Payments & Administration

### US015 - Manage profile and devices
As a user, I want to update profile details, avatar/banner, and active devices so that my account is personalized and secure.
- References: route `/k/profile`, `/api/v1/profile/*`, `/api/v1/devices/*`, `/api/v1/r2/*`; entities MODEL001 User, MODEL002 UserSession.

### US016 - Manage wallet and subscription
As a user, I want to see wallet balance, create payments, check payment status, and review transaction history so that I can pay for premium usage.
- References: route `/k/subscription`, `/api/v1/wallet/*`, `/api/v1/payment/*`; entities MODEL006 Wallet, MODEL007 WalletTransaction, MODEL008 Payment, MODEL009 UserSubscription.

### US017 - Process payment webhooks
As the system, I want to receive SePay webhook callbacks and update payments, wallet balances, and subscription state so that purchases are applied automatically.
- References: `/api/v1/webhook/sepay`, RabbitMQ `payment.success`, `wallet.updated`, `subscription.activated`; entities MODEL006 Wallet, MODEL007 WalletTransaction, MODEL008 Payment, MODEL009 UserSubscription.

### US018 - Manage GenAI tutor knowledge
As a teacher/admin, I want to create folders, upload knowledge files, import datasets, inspect graphs, and bulk process files so that tutor knowledge stays organized.
- References: route `/k/genai-knowledge`, `/api/v1/ai/tutor/*`, Python `/api/tutor/*`; entities MODEL024 UserStorage, MODEL025 Document. Needs verification for exact teacher/admin authorization.

## Mobile Companion

### US019 - Use core Examio flows on mobile
As a mobile user, I want to log in, view AI, study, exams, history, profile, and wallet screens so that I can use Examio from Android or iOS.
- References: `examio-app` Android Compose screens, iOS SwiftUI views, shared KMP repositories; entities mirror web/backend models. Most non-auth platform UIs are mock-data backed and need repository wiring.

### US020 - Receive deep links on mobile
As a mobile user, I want exam, flashcard, chat, profile, and OAuth links to open the right mobile destination so that shared workflows continue in-app.
- References: Android `examio://auth`, iOS `examio` URL scheme, KMP `DeepLink`; Needs verification for non-auth deep link handling completeness.


---

# docs/system/business-rules.md

# Business Rules

Generated: 2026-05-27
Source: scout reports and behavior inventory. Unknowns are marked `Needs verification`.

## Account And Session Rules

| Rule | Related BL/PERM | Description |
|---|---|---|
| BR001 | BL001, PERM002-PERM004 | A user must authenticate through credential login, registration, or Google OAuth before accessing workspace features. |
| BR002 | BL001, BL060 | A wallet is created automatically for new users through backend finance workflow. |
| BR003 | BL009, PERM007-PERM010 | Sessions are tied to device IDs and can be deactivated on logout/device logout. |
| BR004 | BL004, PERM006 | Web clients must attempt token refresh on expired access tokens before forcing logout. |
| BR005 | BL005 | OAuth callback tokens must be captured, persisted, and removed from the browser URL. |
| BR006 | BL011 | iOS currently relies on Swift Keychain auth storage; KMP iOS secure token storage is not implemented. |

## Access And Authorization Rules

| Rule | Related BL/PERM | Description |
|---|---|---|
| BR010 | BL006-BL008, PERM008 | Workspace routes require authenticated state on web. |
| BR011 | BL008, PERM023-PERM025 | Teacher/admin-only intent exists, but route-level teacher role enforcement is not proven. Needs verification. |
| BR012 | BL023, PERM037 | Internal services can validate tokens/check permissions through auth gRPC. |
| BR013 | PERM015-PERM021 | Learning content access depends on ownership/public/shared/access-code rules. Exact public/shared model Needs verification. |
| BR014 | BL042, PERM026 | Exam session join may be allowed without route auth if access code/link validation succeeds at API level. |
| BR015 | PERM034-PERM035 | GenAI knowledge management requires additional access control beyond basic auth. Exact rules Need verification. |

## Quiz, Flashcard, And Materials Rules

| Rule | Related BL/PERM | Description |
|---|---|---|
| BR020 | BL030, PERM016-PERM017 | Authenticated owners can create and manage quiz sets, questions, and labels. |
| BR021 | BL031, PERM019-PERM020 | Authenticated owners can create and manage flashcard sets, cards, and labels. |
| BR022 | BL032 | Web stores should serve cached feature data within TTL and invalidate affected caches after mutations. |
| BR023 | BL033, PERM022 | Student material lists are user-scoped and can include recent/pinned/shareable materials. |
| BR024 | BL034, PERM021 | Flashcard study progress/answers should be recorded only for accessible flashcard sets. |

## Exam Rules

| Rule | Related BL/PERM | Description |
|---|---|---|
| BR030 | BL040-BL041, PERM023-PERM024 | Exam rooms contain exam sessions; sessions define access, timing/status, scoring, retake, and sharing settings. |
| BR031 | BL041 | Exam session lifecycle states include draft/scheduled/active/completed/cancelled on mobile models; backend/web enum parity Needs verification. |
| BR032 | BL042, PERM026 | Session access can be controlled by access code, share link, whitelist, and authenticated ownership/participant rules. |
| BR033 | BL043, PERM027 | Exam attempts persist answers, score, current question index, marked questions, violation count, and attempt status. |
| BR034 | BL044, PERM027 | Secure quiz data may be encrypted and require per-question/attempt tokens for answer submission. |
| BR035 | BL045 | Web exam submissions may require reCAPTCHA tokens. Exact endpoint coverage Needs verification. |
| BR036 | BL046-BL047, PERM028 | Proctoring violations must be logged; penalty/termination thresholds Need verification. |

## AI, OCR, And Storage Rules

| Rule | Related BL/PERM | Description |
|---|---|---|
| BR040 | BL050, PERM029 | AI/PDF uploads must create R2 storage and UserStorage metadata before processing. |
| BR041 | BL051 | AI processing updates file status after OCR/chunking/embedding; failed jobs must be represented in processing status. |
| BR042 | BL052, PERM030 | Quiz/flashcard generation is file-backed and may run asynchronously with job polling/history retrieval. |
| BR043 | BL053, PERM031 | Recent uploads/history are user-scoped. |
| BR044 | BL054, PERM032-PERM033 | AI chat supports streaming, image/document context, and multi-document messages on web. |
| BR045 | BL074 | Mobile AI streaming cannot be considered available until SSE actual implementations are added. |
| BR046 | BL056, PERM034-PERM035 | Tutor knowledge supports folder/file/dataset/graph operations; destructive dataset clear/bulk delete need strict authorization verification. |
| BR047 | BL057, PERM038 | When deleting DB records with R2-backed assets, corresponding R2 objects should also be deleted per project rule; actual coverage Needs verification. |

## Finance And Credit Rules

| Rule | Related BL/PERM | Description |
|---|---|---|
| BR050 | BL061, PERM012 | Wallet balance and transaction history are user-scoped. |
| BR051 | BL062-BL063, PERM013-PERM014 | Payment creation produces a QR/payment record; SePay webhook changes final payment/wallet/subscription state. |
| BR052 | BL064 | Subscription benefits control limits such as files/month and message rate. Exact plan values Need verification. |
| BR053 | BL065, PERM030 | Web client credit checks are currently bypassed by `FREE_MODE = true`; backend enforcement must be verified. |

## Mobile Product Rules

| Rule | Related BL/PERM | Description |
|---|---|---|
| BR060 | BL070-BL072 | Mobile rebuild specs must distinguish shared API readiness from platform UI wiring. |
| BR061 | BL010, BL071 | Android auth is API-backed; Android non-auth feature screens are currently mock-backed unless later evidence proves wiring. |
| BR062 | BL011, BL072 | iOS auth is API-backed through Swift URLSession; iOS non-auth feature screens are currently mock-backed unless later evidence proves wiring. |
| BR063 | BL073 | Mobile deep links include exam session, flashcard, chat, and profile targets, but full navigation behavior Needs verification. |
| BR064 | SCR107 | Android HomeScreen exists but is not wired into main navigation; default tab is AI. |

## Data And Integration Rules

| Rule | Related BL/PERM | Description |
|---|---|---|
| BR070 | BL020-BL022 | Public clients should use gateway `/api/v1`; downstream service URLs are internal configuration. |
| BR071 | BL024 | Cross-service side effects should use RabbitMQ/gRPC where existing workflows already do so. |
| BR072 | BL050-BL051 | AI service and NestJS services share PostgreSQL state for UserStorage/Document/history records, so schema changes affect both stacks. |
| BR073 | BL030-BL064 | Backend Prisma schema is source of truth, but schema duplicate/divergence between trees must be verified before citing exact fields in later waves. |

## Needs Verification

- Exact role model for teacher/admin and whether `isAdmin` or role arrays are authoritative.
- Exact public/shared access rules for quiz sets, flashcard sets, and exam sessions.
- Exact anti-cheating thresholds and resulting attempt/session actions.
- Exact subscription plan values, credit costs, and backend credit enforcement.
- Exact mobile repository wiring roadmap and whether iOS should migrate from private URLSession auth to shared KMP APIs.


---

# docs/system/data-model.md

# Data Model

Generated: 2026-05-27

## Notes

- Backend PostgreSQL/Prisma schema is the source of truth for persisted domain entities.
- Web and mobile types mirror selected backend entities but may not cover full DB shape.
- Field lists are limited to fields present in the scout report; missing fields are marked as Needs verification.
- Stable entity codes use `MODEL###`.

Sources: `plans/260527-1951-rebuild-spec/artifacts/scout-report.md` lines 443-495, 990-1002, 1231-1287.

## Backend Persistent Models

### User / Auth Domain

| Code | Model | Purpose | Key Fields From Scout | Related Coverage |
|---|---|---|---|---|
| MODEL001 | `User` | Core user account | `id`, `email`, `username`, `name`, `avatar`, `banner`, `bio`, `isAdmin`, `isVerified`, `password` | Web `types/user.ts`; mobile `UserModels.kt` |
| MODEL002 | `UserSession` | Refresh/session/device tracking | `sessionId`, `refreshToken`, `deviceId`, `deviceName`, `browser`, `OS`, `IP`, `location` | Web auth store/session handling; mobile `SessionTokens` |
| MODEL003 | `VerifyAccountCode` | Email verification code | Needs verification | Web verify flow |
| MODEL004 | `ResetPasswordCode` | Password reset code | Needs verification | Web/mobile forgot/reset password |
| MODEL005 | `UserMonthlyFileUpload` | Monthly upload limit tracking | Needs verification | AI upload/subscription limit flow |

Sources: `scout-report.md` lines 451-456, 533-557, 953-971, 1217-1219, 1231-1237.

### Finance Domain

| Code | Model | Purpose | Key Fields From Scout | Related Coverage |
|---|---|---|---|---|
| MODEL006 | `Wallet` | User wallet balance | `balance`, one-to-one with `User` | Web subscription store/API; mobile `WalletDetails` |
| MODEL007 | `WalletTransaction` | Wallet transaction history | `amount`, `type`, `direction` (`ADD`/`SUBTRACT`) | Web transaction table; mobile `Transaction` |
| MODEL008 | `Payment` | Payment records | `amount`, `currency`, `status`, `paymentType`, SePay VA | Web QR payment/status/history |
| MODEL009 | `UserSubscription` | Subscription tier state | tier values `0=none`, `1=basic`, `2=advanced`, `3=vip` | Finance gRPC `GetUserBenefits`; web/mobile subscription plans |

Sources: `scout-report.md` lines 458-463, 178-213, 918-919, 1283-1287.

### Quiz Domain

| Code | Model | Purpose | Key Fields From Scout | Related Coverage |
|---|---|---|---|---|
| MODEL010 | `QuizSet` | Quiz collection | `title`, `tags`, public/pinned flags, labels | Web `QuizSet`; mobile `QuizSet` |
| MODEL011 | `QuizSetLabel` | Quiz set label/organization | Needs verification | Web/mobile label types |
| MODEL012 | `QuizQuestion` | Individual quiz question | question text, options array, answer | Web `Quizz`; mobile `Question` |
| MODEL013 | `DetailsQuizQuestion` | QuizSet-to-QuizQuestion junction | history and label links | Needs verification in clients |
| MODEL014 | `QuizPracticeAttempt` | Practice attempt tracking | `type`, answers, score, time, marked questions | Web flashcard/quiz practice flows |

Sources: `scout-report.md` lines 465-470, 995-999, 1264-1270.

### Flashcard Domain

| Code | Model | Purpose | Key Fields From Scout | Related Coverage |
|---|---|---|---|---|
| MODEL015 | `FlashCardSet` | Flashcard collection | `title`, `tags`, `accessCode`, whitelist | Web `FlashcardSet`; mobile `FlashcardSet` |
| MODEL016 | `FlashCard` | Individual flashcard | `question`, `answer` | Web/mobile flashcard types |
| MODEL017 | `DetailsFlashCard` | FlashCardSet-to-FlashCard junction | history links | Needs verification |

Sources: `scout-report.md` lines 472-475, 995-999, 1253-1258.

### Exam Domain

| Code | Model | Purpose | Key Fields From Scout | Related Coverage |
|---|---|---|---|---|
| MODEL018 | `ExamRoom` | Teacher/host exam room | `title`, `description`, host, linked `QuizSet` | Web/mobile exam room types |
| MODEL019 | `ExamSession` | Exam session lifecycle and access rules | `status`, timestamps, `assessType`, `accessCode`, whitelist, `passingScore`, `allowRetake` | Web `ExamSession`; mobile `ExamSession` |
| MODEL020 | `ExamAttempt` | Student attempt state/scoring | `score`, answers, `currentIndex`, `markedQuestions`, `violationCount`, `status` | Web/mobile `ExamAttempt`; secure quiz flow |
| MODEL021 | `CheatingLog` | Proctoring violation record | attempt + type (`TAB_SWITCH`, `WINDOW_BLUR`, `DEVTOOLS_OPEN`, etc.) | Web `useCheatingDetection`; cheating log API |

Sources: `scout-report.md` lines 477-480, 996-997, 1042-1049, 1264-1270.

### AI Chat / Generation Domain

| Code | Model | Purpose | Key Fields From Scout | Related Coverage |
|---|---|---|---|---|
| MODEL022 | `AIChat` | AI chat session | Needs verification | Web AI teacher/chat; mobile `AIChat` |
| MODEL023 | `AIChatMessage` | AI chat message | `role`, `content`, `imageUrl`, document references | Web `aiChatApi`; mobile `AIChatMessage` |
| MODEL024 | `AIChatDocument` | AIChat-to-UserStorage junction | Links chat to user storage for multi-document support | Web multi-document chat |
| MODEL025 | `HistoryGeneratedQuizz` | Saved generated quiz history | quizzes JSON, linked `UserStorage` | Web PDF/exam history |
| MODEL026 | `HistoryGeneratedFlashcard` | Saved generated flashcard history | flashcards JSON, linked `UserStorage` | Web PDF/flashcard history |

Sources: `scout-report.md` lines 482-489, 911-916, 940-945, 1240-1249.

### Storage / Document Domain

| Code | Model | Purpose | Key Fields From Scout | Related Coverage |
|---|---|---|---|---|
| MODEL027 | `UserStorage` | File metadata and processing state | `filename`, `url`, `mimetype`, `size`, `keyR2`, `processingStatus`, `creditCharged` | Web recent uploads/history; AI processing |
| MODEL028 | `Document` | OCR-processed document chunks | `pageRange`, `title`, `content`, embeddings vector | Python AI RAG/generation |
| MODEL029 | `UserStorageGraph` | Graph/RAG artifact | Needs verification | Mentioned in session context only |
| MODEL030 | `UserStorageGraphGroup` | Graph/RAG grouping artifact | Needs verification | Mentioned in session context only |

Sources: `scout-report.md` lines 491-494, 561-590, `_session-context.md` lines 18-21.

## Shared Contracts / Non-DB Models

### gRPC Contracts

| Code | Contract | Service | Methods | Notes |
|---|---|---|---|---|
| MODEL031 | `auth.proto` | `AuthService` | `ValidateToken`, `GetUserInfo`, `CheckPermission` | Auth service port 50051 |
| MODEL032 | `wallet.proto` | `WalletService` | `CreateWallet`, `GetWallet`, `UpdateBalance` | Finance service port 50053 |
| MODEL033 | `subscription.proto` | `SubscriptionService` | `GetUserBenefits` | Finance service port 50053 |
| MODEL034 | `r2.proto` | `R2Service` | `UploadFile`, `GetFileUrl`, `DeleteFile`, `ListUserFiles` | R2 service port 50054 |
| MODEL035 | `ocr.proto` | `OcrService` | `ProcessPdf`, `HealthCheck` | OCR gRPC service |

Source: `scout-report.md` lines 420-440.

### RabbitMQ Event Types

| Code | Event Group | Events |
|---|---|---|
| MODEL036 | User events | `user.created`, `user.updated`, `user.deleted`, `user.verified` |
| MODEL037 | Payment/wallet/subscription events | `payment.success`, `payment.failed`, `wallet.created`, `wallet.updated`, `subscription.activated`, `subscription.expired` |
| MODEL038 | Exam events | `exam.created`, `exam.started`, `exam.submitted` |
| MODEL039 | OCR events | `ocr.requested`, `ocr.completed`, `ocr.failed` |

Source: `scout-report.md` lines 499-530.

## Web Frontend Type Coverage

| Code | Type File | Key Types | Backend Alignment |
|---|---|---|---|
| MODEL040 | `src/types/user.ts` | `User` with wallet balance/admin/verified fields | `User`, `Wallet` subset |
| MODEL041 | `src/types/exam.ts` | `Quizz`, `Flashcard`, `TypeResultGenerateExam` | Quiz/flashcard generation output |
| MODEL042 | `src/types/examSession.ts` | `ExamSession`, status/access/sharing enums/types | `ExamSession`, access rules |
| MODEL043 | `src/types/examRoom.ts` | `ExamRoom`, `ExamSessionBasic` | `ExamRoom`, `ExamSession` subset |
| MODEL044 | `src/types/flashcardSet.ts` | `FlashcardSet`, `Flashcard`, study/access/sharing types | `FlashCardSet`, `FlashCard` |
| MODEL045 | `src/types/quizset.ts` | `QuizSet`, `Quizz`, `QuizSetLabel`, `LastAttemptInfo` | `QuizSet`, `QuizQuestion`, `QuizSetLabel` |
| MODEL046 | `src/types/ai.ts` | `AIModel`, `AIModelCatalog`, default model | AI model catalog endpoint |
| MODEL047 | `src/types/genai-knowledge.ts` | Knowledge folder/file/graph/dataset types | Python tutor storage; exact DB tables need verification |

Source: `scout-report.md` lines 990-1002.

## Mobile Shared Type Coverage

| Code | Kotlin File/Area | Key Types | Backend Alignment |
|---|---|---|---|
| MODEL048 | `SessionModels.kt` | `SessionTokens`, `UserSession` | `UserSession`, auth tokens |
| MODEL049 | `AuthModels.kt` / `UserModels.kt` | login/signup/current user/reset/auth response/user roles | Auth routes and `User` |
| MODEL050 | `AIChatModels.kt` | `AIChat`, `AIChatMessage`, `SendMessageRequest` | `AIChat`, `AIChatMessage` |
| MODEL051 | `SubjectModels.kt` | `SubjectCategory`, `Subject` | Subject taxonomy; DB source needs verification |
| MODEL052 | `AIGeneratorModels.kt` | `RecentUpload`, `GenerateExamRequest`, `GenerateExamResponse` | `UserStorage`, generated histories |
| MODEL053 | `FlashcardModels.kt` | `FlashcardSet`, `Flashcard`, create request, labels | `FlashCardSet`, `FlashCard`, labels |
| MODEL054 | `QuizSetModels.kt` | `QuizSet`, `Question`, create request, labels | `QuizSet`, `QuizQuestion`, labels |
| MODEL055 | `ExamRoomModels.kt` | `ExamRoom`, `ExamSession`, `ExamSessionStatus` | `ExamRoom`, `ExamSession` |
| MODEL056 | `ExamAttemptModels.kt` | `ExamAttempt`, secure question/answer/submit requests | `ExamAttempt`, secure quiz response |
| MODEL057 | `HistoryModels.kt` | stats, PDF history item, exam history item | uploads, attempts, generated history |
| MODEL058 | `ProfileModels.kt` / `WalletModels.kt` | `UserProfile`, update profile, transactions, wallet details, subscription plan | `User`, `Wallet`, `WalletTransaction`, subscriptions |

Sources: `scout-report.md` lines 1217-1287.

## Important Relationships

- `User` owns `UserSession`, wallet/subscription, upload history, learning content, and exam attempts. Exact cardinalities need schema verification.
- `Wallet` is one-to-one with `User`; wallet creation is triggered by `user.created` event or finance gRPC flow.
- `QuizSet` links to `QuizQuestion` through `DetailsQuizQuestion`; `ExamRoom` links to `QuizSet`; `ExamSession` belongs to an exam room/session lifecycle; `ExamAttempt` records student progress and score.
- `FlashCardSet` links to `FlashCard` through `DetailsFlashCard`.
- `UserStorage` stores uploaded file metadata and links to `Document` chunks plus generated quiz/flashcard histories.
- `AIChat` links to `UserStorage` through `AIChatDocument` for multi-document chat.

Sources: `scout-report.md` lines 443-495, 584-590, 599-608.

## Needs Verification

- Full Prisma fields, enums, defaults, unique constraints, cascade behavior, and relation cardinalities.
- Subject/category persisted model names and fields; scout lists frontend/mobile subject types but not DB models in the Prisma domain summary.
- GenAI tutor knowledge file/folder/dataset import DB tables; scout describes API/services but not Prisma model names.
- Whether web/mobile type fields exactly match backend DTOs for secure quiz, payments, AI chat streaming, and subscription plans.
- Whether `UserStorageGraph` and `UserStorageGraphGroup` are active models in current Prisma schema or only noted context entities.


---

# docs/system/glossary.md

# Examio Glossary

Generated: 2026-05-27 20:54 Asia/Saigon
Source artifacts: `_session-context.md`, `data-model.md`, `feature-list.md`, `features/*/business-context.md`, `api-map.md`.

## Product Terms

- **Examio**: Learning and assessment platform spanning web, backend services, AI/OCR processing, and Android/iOS mobile companion apps.
- **Workspace**: Authenticated user area under `/k` where users navigate materials, history, AI tools, profile, subscriptions, and teacher flows.
- **My Materials**: Workspace area for recent or pinned study content such as quiz sets, flashcard sets, exam materials, and uploaded/generated files.
- **History**: User-facing record of prior exam attempts, uploaded PDFs/files, and AI-generated quiz or flashcard outputs.
- **Mobile Companion**: Kotlin Multiplatform-based Android/iOS app intended to expose auth, study, AI, exam, history, account, wallet, and teacher workflows.
- **Teacher/Host**: User role/persona that creates quiz content, exam rooms, exam sessions, and reviews student outcomes; exact role enforcement needs verification.
- **Student/Learner**: User role/persona that studies materials, takes exams, uses AI tools, and manages personal account/payment state.

## Auth, Profile & Sessions

- **User**: Core account record with identity, email, username/name, profile media, verification/admin flags, and password data.
- **Authentication API**: Gateway/auth-service routes for register, login, logout, refresh, current user, password reset/change, Google OAuth, and Google One Tap.
- **Session**: Authenticated continuity record backed by refresh/session/device tracking so users remain signed in across requests and clients.
- **UserSession**: Persisted session/device record containing session ID, refresh token, device ID/name, browser, OS, IP, and location metadata.
- **Refresh Token**: Long-lived token used to renew access without forcing the user to log in again; tracked per user session/device.
- **Bearer Fallback**: Backend support for bearer authorization tokens when cookie-first auth is not available.
- **Device Management**: Profile/security feature for listing active sessions/devices and revoking sessions that are no longer trusted.
- **Email Verification**: Flow that sends and validates a verification code to prove ownership of an account email.
- **VerifyAccountCode**: Database record for email verification codes; exact fields need schema verification.
- **ResetPasswordCode**: Database record for password recovery codes; exact fields need schema verification.
- **OAuth / Google Sign-In**: Social login path using Google redirect, callback, or One Tap instead of email/password.
- **Profile Media**: Avatar and banner images uploaded through storage/R2 flows and reused across clients.

## Learning Content

- **Quiz Set**: Reusable collection of quiz questions, labels, tags, sharing/access flags, and generated/manual study content.
- **Quiz Question**: Individual question item with question text, answer/options data, and related details.
- **DetailsQuizQuestion**: Junction/link entity between quiz sets, questions, history, and labels.
- **Quiz Set Label**: Organizational label for grouping or categorizing quiz sets/questions.
- **Quiz Practice Attempt**: Practice-mode tracking record for answers, score, time, marked questions, and attempt type.
- **Flashcard Set**: Reusable collection of flashcards with title, tags, access code, whitelist, and sharing/access behavior.
- **Flashcard**: Individual recall card with question/front and answer/back content.
- **DetailsFlashCard**: Junction/link entity between flashcard sets, flashcards, and history.
- **Flashcard Study Session**: User flow for reviewing cards, submitting answers/progress, and resuming repetition work.
- **Generated Quiz History**: Saved AI-generated quiz output linked to a user upload/storage item.
- **Generated Flashcard History**: Saved AI-generated flashcard output linked to a user upload/storage item.
- **Student Materials API**: Student-facing gateway routes for recent materials, pinned materials, and access to quiz/flashcard/exam resources.

## Exams & Integrity

- **Exam Room**: Teacher/host-owned container for assessment setup, linked quiz content, sessions, analytics, and participant workflows.
- **Exam Session**: Scheduled or shareable exam occurrence within a room, with status, timestamps, access code, whitelist, passing score, and retake rules.
- **Exam Attempt**: Student's active or completed exam-taking record containing answers, score, current index, marked questions, violation count, and status.
- **Secure Quiz Payload**: Protected/encrypted quiz content sent to students during exam-taking; exact route and response shape need verification.
- **Access Code**: Code used to join protected flashcard sets or exam sessions, depending on feature context.
- **Whitelist**: Allowed-user list for restricting flashcard or exam session access.
- **Retake Rule**: Session configuration controlling whether and how students can attempt an exam again.
- **Passing Score**: Minimum score threshold configured for an exam session.
- **Marked Questions**: Questions flagged by the student during practice or exam-taking for later review.
- **Cheating Log**: Proctoring/integrity record tied to an exam attempt and violation type.
- **Proctoring Signal**: Browser or environment event such as tab switch, window blur, or devtools open used to create cheating logs.
- **Integrity Logging**: Capture and persistence of suspicious exam-taking behavior for teacher review and analytics.

## Wallet, Payments & Subscription

- **Wallet**: One-to-one user finance account storing balance and enabling paid feature usage.
- **Wallet Transaction**: Ledger entry for balance movement, including amount, type, and direction such as `ADD` or `SUBTRACT`.
- **Payment**: Finance record for a purchase/payment attempt with amount, currency, status, payment type, and SePay virtual-account data.
- **Subscription**: User paid-tier state used to unlock benefits; current tier values are `0=none`, `1=basic`, `2=advanced`, `3=vip`.
- **Subscription Benefits**: Capabilities/limits returned through finance gRPC and used by other services to decide paid feature access.
- **SePay**: Payment provider integrated through QR/status/history flows and webhook callbacks.
- **Payment Webhook**: External callback endpoint used by SePay to confirm payment success/failure and trigger wallet/subscription updates.
- **Payment Polling**: Client behavior that checks payment status until success, cancellation, failure, or timeout.
- **FREE_MODE**: Web frontend bypass flag currently noted as bypassing credit checks; production intent needs verification.

## Storage, OCR & AI

- **R2**: Cloudflare R2 object storage used for user uploads, profile media, generated-history source files, and AI/tutor files.
- **R2 Service**: Backend storage service exposing upload, signed URL, delete, and list operations via gRPC and gateway/exam-service routes.
- **UserStorage**: Database metadata for uploaded files, including filename, URL, mimetype, size, R2 key, processing status, and credit charge.
- **Document**: OCR-processed text chunk/page record with page range, title, content, and embedding vector for retrieval/generation.
- **OCR**: Optical character recognition pipeline that extracts text from PDFs/images for AI generation and retrieval.
- **OCR Service**: Hybrid NestJS gRPC and Python backend service exposing `ProcessPdf` and health check behavior.
- **RAG**: Retrieval-augmented generation flow where uploaded document chunks are retrieved and used as context for AI answers or generation.
- **GraphRAG**: Graph-based retrieval artifact/approach using entities/relationships or graph snapshots to improve contextual AI answers.
- **UserStorageGraph**: Graph/RAG artifact associated with uploaded storage; exact active schema and fields need verification.
- **UserStorageGraphGroup**: Grouping artifact for storage graphs; exact active schema and fields need verification.
- **Embedding**: Vector representation of document text used by retrieval search and AI context selection.
- **AI Upload Job**: Asynchronous upload/process/generation task that can be polled by job ID or upload ID.
- **AI Generation**: Flow that turns uploaded documents/images into quiz or flashcard outputs and optionally saves them as reusable content.
- **AI Model Catalog**: API-backed list/defaults of available AI models for generation or tutor flows.
- **AI Tutor / Virtual Tutor**: Conversational assistant that answers learner questions using subjects, images, uploaded documents, and tutor knowledge sources.
- **AI Chat**: Persisted chat session with messages, optional images, and document context.
- **AI Chat Message**: Message record with role, content, optional image URL, and document references.
- **AI Chat Document**: Link between an AI chat and a user storage item for multi-document chat.
- **SSE Streaming**: Server-sent events used by web AI chat to stream model responses; mobile streaming is noted as incomplete/stubbed.
- **Tutor Knowledge Base**: Teacher/admin-managed AI tutor sources including folders, files, dataset imports, graph snapshots, and reprocessing jobs.
- **Dataset Import**: Tutor knowledge ingestion job that imports predefined or uploaded datasets into the tutor knowledge system.

## Backend & Integration Terms

- **Gateway Service**: Public HTTP entry point that exposes `/api/v1/*` routes and proxies to downstream backend services.
- **Auth Service**: NestJS service responsible for account auth, sessions, OAuth, profile/session helpers, and auth gRPC methods.
- **Exam Service**: NestJS domain service for quiz/flashcard/exam/AI orchestration, including calls to R2, finance, and Python AI services.
- **Finance Service**: NestJS service for wallet, payment, subscription, and finance gRPC behavior.
- **AI Service**: Python FastAPI service for RAG, OCR/document processing, chat, generation, entity extraction, graph stats, and tutor APIs.
- **gRPC Contract**: Service-to-service typed API, including auth, wallet, subscription, R2, and OCR proto packages.
- **RabbitMQ Event**: Asynchronous domain message on `examio.events`, including user, payment/wallet/subscription, exam, and OCR events.
- **Wallet Bootstrap**: Finance-side creation of a user wallet triggered by user registration or `user.created` event.
- **Prisma Schema**: Shared PostgreSQL model source of truth under backend database library.
- **Zustand Store**: Web frontend feature state layer that calls API wrappers and caches/manages client state.
- **Axios API Client**: Web HTTP client layer that attaches bearer/device headers and handles auth/session failures.

## Mobile & Platform Terms

- **KMP**: Kotlin Multiplatform shared code layer used by Android and iOS for API services, repositories, DTOs, and auth-related logic.
- **Android Compose**: Native Android UI toolkit used by the mobile companion app.
- **SwiftUI**: Native iOS UI toolkit used by the iOS companion app.
- **Secure Storage**: Mobile token/session storage pattern; iOS currently uses separate Swift/Keychain auth storage and shared KMP iOS storage needs verification.
- **Mock UiState**: Local sample state used by many non-auth mobile screens before production repository wiring is complete.
- **DTO Parity**: Requirement that mobile/web type shapes match backend DTOs for auth, study, exams, payments, AI chat, and subscription data.
- **Deep Link**: Mobile/web route entry from an external link; non-auth mobile deep-link completion needs verification.

## Unresolved Terms / Needs Verification

- Exact backend role model and enforcement for teacher/admin-only flows.
- Exact device management route list and route naming.
- Exact secure quiz route names and encrypted payload shape.
- Exact cheating violation thresholds and whether violations warn, score, or terminate attempts.
- Exact subscription plan endpoints and production behavior for `FREE_MODE`.
- Exact R2 HTTP proxy route coverage and delete ordering between database records and remote objects.
- Exact subject/category persisted model names and fields.
- Exact GenAI tutor knowledge database tables and permission model.
- Whether `UserStorageGraph` and `UserStorageGraphGroup` are active Prisma models or planned/context-only terms.

**Status:** DONE
**Summary:** Created concise Examio product/domain/technical glossary from existing rebuild specs at `plans/260527-1951-rebuild-spec/artifacts/glossary.md`.
**Concerns/Blockers:** Some source artifacts mark role enforcement, route coverage, GraphRAG storage models, and mobile wiring as needing verification; listed unresolved terms above.


---

# docs/system/overview.md

# System Overview

Generated: 2026-05-27

## Scope

Examio is a three-workspace learning and exam platform:

- Backend: `examio-be/` NestJS monorepo plus Python FastAPI AI/OCR services.
- Frontend: `examio-fe/` React 19 + Vite + TypeScript web app.
- Mobile: `examio-app/` Kotlin Multiplatform app with Android Compose and iOS SwiftUI.

Sources: `plans/260527-1951-rebuild-spec/artifacts/_session-context.md`, `plans/260527-1951-rebuild-spec/artifacts/scout-report.md`.

## Backend Architecture

- Public entry point is `gateway-service` on port 3000, forwarding `/api/v1/*` traffic to internal services through proxy controllers.
- Domain services include `auth-service`, `exam-service`, `finance-service`, `r2-service`, `ocr-service`, and Python `ai-service`.
- Shared libraries are `@examio/common`, `@examio/database`, and `@examio/redis`.
- Persistence uses PostgreSQL through Prisma; Redis is used for caching; RabbitMQ topic exchange `examio.events` handles async events.
- gRPC contracts connect auth, wallet/subscription, R2 storage, and OCR services.

Sources: `scout-report.md` lines 20-37, 61-93, 365-430, 499-530.

## Core Service Roles

| Service | Role | Source |
|---|---|---|
| `gateway-service` | API gateway/reverse proxy for FE/mobile clients | `scout-report.md` lines 61-93 |
| `auth-service` | Registration, login, OAuth, JWT/session/device management | `scout-report.md` lines 96-147 |
| `exam-service` | Quiz, flashcard, exam room/session/attempt, AI integration, file metadata | `scout-report.md` lines 150-175 |
| `finance-service` | Wallet, payments, SePay, subscriptions | `scout-report.md` lines 178-213 |
| `r2-service` | Cloudflare R2 file upload/download/signed URL/list/delete | `scout-report.md` lines 216-240 |
| `ai-service` | OCR, RAG, AI chat, quiz/flashcard generation, tutor knowledge | `scout-report.md` lines 243-333 |
| `ocr-service` | Hybrid NestJS gRPC + Python OCR backend | `scout-report.md` lines 336-361 |

## Web Frontend Architecture

- React Router v7 defines public, auth, protected workspace, and standalone study/exam routes.
- Axios instance uses `VITE_API_URL=/api/v1`, sends credentials, injects bearer token and `X-Device-ID`, and refreshes tokens on 401.
- Zustand stores hold feature state for auth, quiz sets, flashcards, exam rooms/sessions, AI generation/chat, model catalog, stats, student materials, and GenAI knowledge.
- `storeCache` provides in-memory TTL caching and mutation invalidation across stores.
- UI is organized into pages, templates, components, hooks, stores, APIs, and types.

Sources: `scout-report.md` lines 797-805, 828-887, 891-947.

## Mobile Architecture

- KMP shared module provides Ktor API services, repositories, models, token storage interfaces, and common async result types.
- Android uses Compose with local mutable UI state and manual DI through `AndroidAppContainer`.
- iOS uses SwiftUI with `AuthViewModel` for auth and local `@State` for most feature screens.
- Mobile data flow is `View -> UiState -> Repository -> ApiService -> Backend`.
- Auth is real on Android and iOS; most non-auth platform screens currently use mock UiState data despite real shared API/repository layers.

Sources: `scout-report.md` lines 1146-1168, 1201-1288, 1305-1459, 1462-1488.

## Key End-To-End Flows

### Authentication

1. Client calls gateway `/api/v1/auth/login` or `/api/v1/auth/register`.
2. `auth-service` issues JWT access token, refresh token, and session ID.
3. Web stores tokens in localStorage/cookies; mobile stores tokens in Android secure storage or iOS Keychain.
4. Subsequent requests authenticate by cookie first or bearer fallback.
5. Refresh uses `/auth/refresh`; session/device tracking uses `X-Device-ID`.

Sources: `scout-report.md` lines 533-557, 951-975, 1440-1459.

### AI File Processing

1. Client uploads file through gateway `/api/v1/ai/quick-upload` or `/api/v1/ai/upload`.
2. `exam-service` uploads to R2 through `R2Service.UploadFile`.
3. `exam-service` creates `UserStorage` metadata.
4. `ai-service` processes OCR/chunks/embeddings and writes `Document` records.
5. `UserStorage.processingStatus` tracks processing lifecycle.

Sources: `scout-report.md` lines 584-590, 599-608.

### Exam Taking

- Web has standalone `/exam-session/:id` and `/exam-session/:id/quiz` routes without route guard; access is handled by API-level checks.
- Exam attempt APIs handle start/resume/submit/progress/secure quiz.
- Anti-cheating uses browser hooks for tab/window/devtools/copy/paste/fullscreen signals and logs violations.
- Mobile shared API has secure quiz models and exam attempt repository support; platform UIs are currently mock-backed.

Sources: `scout-report.md` lines 883-887, 913-922, 1042-1049, 1264-1270, 1478-1487.

## Known Gaps / Needs Verification

- `TeacherRoute.tsx` only checks authentication, not teacher/admin role.
- `FREE_MODE = true` in web credit utilities bypasses credit checks.
- Web has remnants of prior Next.js migration; route/proxy prefix consistency needs verification.
- Mobile SSE clients are stubs on both Android and iOS.
- iOS KMP secure token storage is stubbed; actual token store is private Swift code.
- Most Android/iOS non-auth screens use mock UiState rather than repositories.

Sources: `scout-report.md` lines 1121-1132, 1464-1502.


---

# docs/system/permissions.md

# Permissions

Generated: 2026-05-27
Source: scout reports. Unknowns are marked `Needs verification`.

## Permission Catalog

| ID | Permission | Actor | Enforcement | Notes |
|---|---|---|---|---|
| PERM001 | View public marketing/legal pages | Anonymous, authenticated user | Public routes | SCR001-SCR007. |
| PERM002 | Register account | Anonymous | Public auth API | Creates user and starts wallet bootstrap. |
| PERM003 | Login with credentials | Anonymous | Public auth API | Issues tokens/cookies/session. |
| PERM004 | Login with Google OAuth / One Tap | Anonymous | Public OAuth API | Redirect/callback token flow. |
| PERM005 | Request/reset password | Anonymous | Public auth API | Reset code required. |
| PERM006 | Refresh session | Anonymous with refresh token/session | Auth API | Public endpoint but requires valid refresh/session token. |
| PERM007 | Logout current session | Authenticated user | Auth guard/session ownership | Clears/deactivates session. |
| PERM008 | Access workspace `/k/*` | Authenticated user | Web ProtectedRoute + backend auth | Frontend guard plus API auth. |
| PERM009 | View/update own profile | Authenticated user | Backend auth/ownership | Includes avatar/banner upload via R2 image API. |
| PERM010 | Manage own devices/sessions | Authenticated user | Backend auth/ownership | List/logout devices. |
| PERM011 | Verify own account | Authenticated user | Auth API + verification code | Email verification. |
| PERM012 | View own wallet/subscription/payment history | Authenticated user | Finance auth/ownership | Web and mobile shared API. |
| PERM013 | Create/cancel own payment | Authenticated user | Finance auth/ownership | QR payment flow. |
| PERM014 | Receive SePay webhook | External SePay caller | API key | Backend-only route. |
| PERM015 | View public/owned/shared quiz sets | Authenticated user; maybe public user | Service access rules | Some quiz routes noted as auth/some public; exact public rules Need verification. |
| PERM016 | Create quiz set | Authenticated user | Exam auth | Owner becomes manager. |
| PERM017 | Edit/delete own quiz set/questions/labels | Owner | Exam ownership checks | Shared/collab rules Need verification. |
| PERM018 | View public/owned/shared flashcard sets | Authenticated user; maybe public user | Service access rules | Exact public rules Need verification. |
| PERM019 | Create flashcard set | Authenticated user | Exam auth | Owner becomes manager. |
| PERM020 | Edit/delete own flashcard set/cards/labels | Owner | Exam ownership checks | Shared/collab rules Need verification. |
| PERM021 | Study accessible flashcard set | User with access | API-level access checks | Web route is unguarded. |
| PERM022 | View/manage student materials | Authenticated user | Exam/student auth | Own recent/pinned/share materials. |
| PERM023 | Create/manage exam rooms | Authenticated user; intended teacher/admin Needs verification | Exam auth + ownership | TeacherRoute does not enforce role on web. |
| PERM024 | Create/manage exam sessions | Room owner; intended teacher/admin Needs verification | Exam auth + ownership | Includes sharing/settings. |
| PERM025 | View exam room session analytics | Room owner; intended teacher/admin Needs verification | Exam auth + ownership | Web route protected by auth only client-side. |
| PERM026 | Join exam session by code/link | Anonymous or authenticated with valid access | API-level access code/link/whitelist | Standalone route has no web guard. |
| PERM027 | Start/resume/submit own exam attempt | Authorized participant | Exam attempt auth/access rules | Some entry may be public-code; exact identity requirements Need verification. |
| PERM028 | Log cheating violation | Exam participant/session client | Cheating log API auth/access | Route table says auth; standalone route behavior Need verification. |
| PERM029 | Upload AI/PDF file | Authenticated user | Exam auth + upload limits | 50MB client limit; backend/R2 limit. |
| PERM030 | Generate quiz/flashcards from file | Authenticated user with accessible upload/credits | Exam auth + AI/finance checks | Web client FREE_MODE bypasses client checks; backend checks Need verification. |
| PERM031 | View/delete/regenerate own AI uploads/jobs/history | Owner | Exam auth/ownership | Includes recent uploads/history. |
| PERM032 | Use AI chat | Authenticated user | Exam auth + optional subscription checks | Multi-document context. |
| PERM033 | Upload AI chat image/document | Authenticated user | Exam/R2 auth/ownership | Exact limits Need verification. |
| PERM034 | Manage GenAI tutor knowledge | Authenticated user with allowed access Needs verification | Web access utility + backend auth | Allowed emails/admin rules Need verification. |
| PERM035 | Import/clear tutor datasets | Authorized GenAI knowledge user Needs verification | Backend auth | Potential high-risk admin-like operation. |
| PERM036 | View subjects | Public | Public subject API | `/subjects` listed public. |
| PERM037 | Validate JWT/check permission via gRPC | Internal services | Service-to-service gRPC | Auth service methods. Network/auth hardening Needs verification. |
| PERM038 | Upload/get/delete/list R2 files | Internal services/user-scoped auth | R2 gRPC + service auth | Direct client access is via gateway/exam service. |
| PERM039 | Process OCR/AI jobs | Internal services/workers | Internal HTTP/RabbitMQ | External exposure Needs verification. |
| PERM040 | Use mobile feature UIs beyond auth | Authenticated mobile user | Mostly local mock state | API permissions exist in shared repositories but UI not wired. |

## Role Model

| Role | Known Evidence | Notes |
|---|---|---|
| Anonymous | Public pages, auth, password reset, OAuth, public subject list, exam join by code/link. | Standalone study/exam routes rely on API checks. |
| Authenticated User / Student | Workspace, own profile, wallet, content, attempts, AI, history. | Primary production role. |
| Teacher | Teacher route/screens and exam room/content management imply teacher capabilities. | Actual role enforcement Needs verification; web TeacherRoute only checks auth. |
| Admin | `User.isAdmin` exists; mobile shared `UserRole.Admin` exists. | Route guard usage not proven. |
| Internal Service | gRPC auth/R2/wallet/subscription/OCR and AI HTTP/RabbitMQ. | Service authentication model Needs verification. |
| External Webhook Provider | SePay webhook. | API key protected per scout. |

## Mobile Permission Notes

- Android/iOS auth screens are API-backed and enforce backend auth permissions.
- Android/iOS main feature screens are mostly mock-backed; they currently demonstrate UI permissions only, not backend-enforced feature permissions.
- Shared KMP repositories are ready to call authenticated APIs for AI/study/exam/history/account, but platform UI wiring is not present in scout evidence.
- iOS KMP token storage is stubbed; iOS auth uses a private Swift Keychain store instead.
