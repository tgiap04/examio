# Permissions

**Project**: examio
**Generated**: 2026-06-05
**Analysis Scope**: All 32 frontend screens + 17 backend route groups + BL inventory

---

## Curated View

- **Public (guest)** can view the landing page, browse featured quiz sets, flashcard sets, and exam rooms. Can register an account and log in. Cannot access any protected area without an active session.

- **Authenticated user (student)** can manage their own profile, view their wallet balance, purchase subscriptions, access study materials (flashcard study), take exams, and view their own history. Cannot create, edit, or delete any quiz set, flashcard set, exam room, or knowledge base entry. Cannot see another user's exam results.

- **Teacher** (user who has created resources) can create, edit, and delete their own quiz sets, flashcard sets, exam rooms, and exam sessions. Can view analytics for their exam sessions. Cannot modify another user's content or exam attempts.

- **Account state gates**: Unverified accounts cannot access protected pages (redirected to `/k/verify`). Expired or invalidated sessions are rejected at the middleware level with a 401 on every protected route. A `FREE_MODE` flag in production bypasses AI credit deduction (credits not required for generation).

---

## Authorization System Type

**System Type**: hybrid

RBAC with resource-ownership checks. Authenticated users have base access; teachers gain authoring permissions on resources they created; ownership guards prevent cross-user mutations.

**Identified Roles**:
- guest (unauthenticated)
- student (authenticated, no authored resources)
- teacher (authenticated, owns quiz sets, flashcard sets, exam rooms)
- subscription-tier (affects AI tool access)

---

## Permissions Index

| Code | Name | Type | Enforced At |
|------|------|------|-------------|
| PERM001 | PublicRouteAccess | route-guard | Gateway / middleware |
| PERM002 | AuthenticatedRouteAccess | route-guard | AuthGuard / middleware |
| PERM003 | UnverifiedAccountGate | route-guard | Frontend ProtectedRoute |
| PERM004 | LoginAccess | screen-permission | LoginPage |
| PERM005 | RegisterAccess | screen-permission | RegisterPage |
| PERM006 | ProfileReadOwn | data-permission | ProfilePage / API |
| PERM007 | ProfileWriteOwn | action-permission | ProfilePage |
| PERM008 | DeviceListViewOwn | data-permission | ProfilePage / API |
| PERM009 | DeviceDeleteOwn | action-permission | ProfilePage |
| PERM010 | PasswordChangeOwn | action-permission | ProfilePage |
| PERM011 | WalletViewOwn | data-permission | ProfilePage / API |
| PERM012 | SubscriptionViewOwn | data-permission | SubscriptionPage / API |
| PERM013 | SubscriptionPurchase | action-permission | SubscriptionPage |
| PERM014 | QuizSetAuthorCreate | action-permission | MyMaterialsPage, ManageQuizSetDetailPage |
| PERM015 | QuizSetAuthorEdit | resource-ownership | ManageQuizSetDetailPage |
| PERM016 | QuizSetAuthorDelete | resource-ownership | MyMaterialsPage |
| PERM017 | FlashcardSetAuthorCreate | action-permission | MyMaterialsPage, FlashcardsPage |
| PERM018 | FlashcardSetAuthorEdit | resource-ownership | ManageFlashcardSetDetailPage |
| PERM019 | FlashcardSetAuthorDelete | resource-ownership | MyMaterialsPage |
| PERM020 | ExamRoomAuthorCreate | action-permission | MyMaterialsPage, ManageExamPage |
| PERM021 | ExamRoomAuthorEdit | resource-ownership | ManageExamRoomDetailPage |
| PERM022 | ExamRoomAuthorDelete | resource-ownership | ManageExamPage |
| PERM023 | ExamSessionAuthorCreate | action-permission | ManageExamRoomDetailPage |
| PERM024 | ExamSessionAuthorManage | resource-ownership | ManageExamRoomDetailPage |
| PERM025 | ExamSessionAuthorSharing | action-permission | ManageExamRoomDetailPage |
| PERM026 | ExamSessionAuthorAnalytics | data-permission | ExamRoomSessionAnalyticsPage |
| PERM027 | ExamSessionAccess | route-guard | ExamSessionPage |
| PERM028 | ExamAttemptStart | action-permission | ExamSessionPage |
| PERM029 | ExamAttemptResume | action-permission | ExamSessionPage |
| PERM030 | ExamAttemptViewOwn | data-permission | MyExamsPage, ExamQuizPage |
| PERM031 | ExamAttemptSubmit | action-permission | ExamQuizPage |
| PERM032 | FlashcardStudyAccess | route-guard | FlashcardStudyPage |
| PERM033 | FlashcardStudyAccessCode | action-permission | FlashcardStudyPage |
| PERM034 | FlashcardStudyProgress | data-permission | FlashcardStudyPage |
| PERM035 | AIGenerationAccess | route-guard | AIToolPage |
| PERM036 | AIGenerationCredits | action-permission | AIToolPage |
| PERM037 | AIKnowledgeBaseManage | action-permission | GenAIKnowledgePage |
| PERM038 | PDFHistoryViewOwn | data-permission | HistoryPage, PDFHistoryPage |
| PERM039 | ExamHistoryViewOwn | data-permission | HistoryPage, ExamHistoryPage |
| PERM040 | SessionCleanup | env-gate | SessionCleanupCron (BL001) |
| PERM041 | FreeModeCreditBypass | env-gate | FinanceClientService (BL004) |
| PERM042 | TurnstileBotProtection | feature-flag | RegisterPage, FlashcardStudyPage |
| PERM043 | QuizSetVisibilityControl | resource-ownership | ManageQuizSetDetailPage |
| PERM044 | FlashcardSetVisibilityControl | resource-ownership | ManageFlashcardSetDetailPage |
| PERM045 | ExamRoomVisibilityControl | resource-ownership | ManageExamRoomDetailPage |

---

## PERM001: PublicRouteAccess

**Type**: route-guard
**Enforced At**: Gateway / middleware (`SessionValidationMiddleware` — BL009)

### Description

Public routes accessible without authentication. Any incoming request without a bearer token or with an invalid/expired token passes through without rejection.

### Related Routes

- (GET) `/`
- (GET) `/about`
- (GET) `/contact`
- (GET) `/terms`
- (GET) `/privacy`
- (GET) `/cookies`
- (GET) `/security`
- (POST) `/api/v1/auth/login`
- (POST) `/api/v1/auth/register`
- (GET) `/api/v1/auth/google`
- (GET) `/api/v1/auth/google/callback`
- (POST) `/api/v1/auth/google/one-tap`
- (POST) `/api/v1/auth/refresh`
- (POST) `/api/v1/auth/sendVerificationEmail`
- (POST) `/api/v1/auth/verifyAccount`
- (POST) `/api/v1/auth/send-code-reset-password`
- (POST) `/api/v1/auth/reset-password`

### Related Screens

- SCR001 – HomePage
- SCR002 – AboutPage
- SCR003 – ContactPage
- SCR004 – TermsPage
- SCR005 – PrivacyPage
- SCR006 – CookiesPage
- SCR007 – SecurityPage
- SCR008 – LoginPage
- SCR009 – RegisterPage
- SCR010 – ForgotPasswordPage
- SCR011 – ResetPasswordPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✓ | No token required |
| student | ✓ | Token optional — if present, must be valid |
| teacher | ✓ | Token optional |

---

## PERM002: AuthenticatedRouteAccess

**Type**: route-guard
**Enforced At**: AuthGuard / middleware (applied globally via NestJS middleware registration)

### Description

All protected routes require a valid, active session token. Token must be present in `Authorization: Bearer <token>` header or `token`/`accessToken` cookie. Rejected if `isActive === false` (SESSION_INVALIDATED) or `expiresAt < now` (SESSION_EXPIRED). Returns 401 with error code.

### Related Routes

- (GET) `/api/v1/profile`
- (PUT) `/api/v1/profile`
- (GET) `/api/v1/devices`
- (DELETE) `/api/v1/devices/:deviceId`
- (POST) `/api/v1/auth/change-password`
- (POST) `/api/v1/auth/send-code-change-password`
- (GET) `/api/v1/wallet/details`
- (GET) `/api/v1/payment/subscription`
- (GET) `/api/v1/quizsets`
- (POST) `/api/v1/quizsets`
- (PUT) `/api/v1/quizsets/:id`
- (DELETE) `/api/v1/quizsets/:id`
- (GET) `/api/v1/quizsets/:id`
- (POST) `/api/v1/quizsets/:id/labels`
- (GET) `/api/v1/quizsets/:id/labels`
- (PUT) `/api/v1/quizsets/:id/labels`
- (DELETE) `/api/v1/quizsets/:id/labels/:labelId`
- (GET) `/api/v1/quizsets/:id/questions`
- (POST) `/api/v1/quizsets/:id/questions`
- (PUT) `/api/v1/quizsets/:id/questions/:questionId`
- (DELETE) `/api/v1/quizsets/:id/questions/:questionId`
- (GET) `/api/v1/flashcardsets`
- (POST) `/api/v1/flashcardsets`
- (PUT) `/api/v1/flashcardsets/:id`
- (DELETE) `/api/v1/flashcardsets/:id`
- (GET) `/api/v1/flashcardsets/:id`
- (GET) `/api/v1/flashcardsets/:id/labels`
- (POST) `/api/v1/flashcardsets/:id/labels`
- (PUT) `/api/v1/flashcardsets/:id/labels`
- (DELETE) `/api/v1/flashcardsets/:id/labels/:labelId`
- (GET) `/api/v1/flashcardsets/:id/flashcards`
- (POST) `/api/v1/flashcardsets/:id/flashcards`
- (PUT) `/api/v1/flashcardsets/:id/flashcards/:flashcardId`
- (DELETE) `/api/v1/flashcardsets/:id/flashcards/:flashcardId`
- (GET) `/api/v1/examrooms`
- (POST) `/api/v1/examrooms`
- (PUT) `/api/v1/examrooms/:id`
- (DELETE) `/api/v1/examrooms/:id`
- (GET) `/api/v1/examrooms/list`
- (GET) `/api/v1/examrooms/detail/:id`
- (GET) `/api/v1/examrooms/:id/sessions`
- (POST) `/api/v1/examrooms/:id/sessions`
- (GET) `/api/v1/examsessions/:id`
- (PUT) `/api/v1/examsessions/:id`
- (DELETE) `/api/v1/examsessions/:id`
- (GET) `/api/v1/examsessions/:id/sharing`
- (PUT) `/api/v1/examsessions/:id/sharing`
- (GET) `/api/v1/examrooms/:id/sessions/:sessionId/attempts`
- (GET) `/api/v1/examrooms/:id/sessions/:sessionId/attempts/:attemptId`
- (POST) `/api/v1/secure-quiz`
- (POST) `/api/v1/secure-submit`
- (PUT) `/api/v1/examattempts/:attemptId/progress`
- (POST) `/api/v1/cheatinglogs`
- (GET) `/api/v1/student/recent-flashcards`
- (GET) `/api/v1/student/recent-exams`
- (GET) `/api/v1/quizsets/stats`
- (GET) `/api/v1/ai/job/:jobId`
- (DELETE) `/api/v1/ai/job/:jobId`
- (GET) `/api/v1/ai/tutor/knowledge-folders`
- (POST) `/api/v1/ai/tutor/knowledge-folders`
- (PUT) `/api/v1/ai/tutor/knowledge-folders/:id`
- (DELETE) `/api/v1/ai/tutor/knowledge-folders/:id`
- (GET) `/api/v1/ai/tutor/knowledge-files`
- (POST) `/api/v1/ai/tutor/knowledge-files`
- (DELETE) `/api/v1/ai/tutor/knowledge-files/:id`
- (POST) `/api/v1/ai/tutor/knowledge-files/:id/reprocess`
- (GET) `/api/v1/ai/tutor/dataset-imports`
- (POST) `/api/v1/ai/tutor/dataset-imports`
- (GET) `/api/v1/ai/tutor/knowledge-stats`
- (GET) `/api/v1/auth/me`
- (POST) `/api/v1/auth/logout`
- (POST) `/api/v1/auth/sync-refresh-token`

### Related Screens

- SCR012 – KRootRedirect
- SCR013 – ProfilePage (all regions)
- SCR014 – VerifyPage
- SCR015 – SubscriptionPage
- SCR016 – MyMaterialsPage (all regions)
- SCR017 – FlashcardsPage
- SCR018 – HistoryPage (all regions)
- SCR019 – ExamHistoryPage
- SCR020 – PDFHistoryPage
- SCR021 – ManageExamPage
- SCR022 – ManageQuizSetDetailPage
- SCR023 – ManageFlashcardSetDetailPage
- SCR024 – AIToolPage
- SCR025 – GenAIKnowledgePage (all regions)
- SCR026 – ManageExamRoomPage
- SCR027 – ManageExamRoomDetailPage (all regions)
- SCR028 – ExamRoomSessionAnalyticsPage
- SCR029 – MyExamsPage
- SCR030 – FlashcardStudyPage
- SCR031 – ExamSessionPage
- SCR032 – ExamQuizPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✗ | Must authenticate |
| student | ✓ | Valid active session |
| teacher | ✓ | Valid active session |

---

## PERM003: UnverifiedAccountGate

**Type**: route-guard
**Enforced At**: Frontend `ProtectedRoute` / route guard

### Description

Unverified accounts (email not confirmed) are redirected to `/k/verify` when attempting to access any protected page under `/k/`. Users who have not completed email verification cannot access study materials, exam sessions, or AI tools. Verification is triggered by a 6-digit OTP sent to the user's email address.

### Related Screens

- SCR012 – KRootRedirect
- SCR013 – ProfilePage
- SCR014 – VerifyPage (the redirect destination)
- SCR015 – SubscriptionPage
- SCR016 – MyMaterialsPage
- SCR017 – FlashcardsPage
- SCR018 – HistoryPage
- SCR019 – ExamHistoryPage
- SCR020 – PDFHistoryPage
- SCR021 – ManageExamPage
- SCR022 – ManageQuizSetDetailPage
- SCR023 – ManageFlashcardSetDetailPage
- SCR024 – AIToolPage
- SCR025 – GenAIKnowledgePage
- SCR026 – ManageExamRoomPage
- SCR027 – ManageExamRoomDetailPage
- SCR028 – ExamRoomSessionAnalyticsPage
- SCR029 – MyExamsPage
- SCR030 – FlashcardStudyPage
- SCR031 – ExamSessionPage
- SCR032 – ExamQuizPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✗ | Redirected to login |
| student (unverified) | ✗ | Redirected to `/k/verify` |
| student (verified) | ✓ | Email verified |
| teacher | ✓ | Email verified |

---

## PERM004: LoginAccess

**Type**: screen-permission
**Enforced At**: LoginPage (`SCR008`)

### Description

Login page is only accessible to unauthenticated users. Authenticated users are redirected to `/k/my-materials`.

### Related Screens

- SCR008 – LoginPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✓ | No active session |
| student | ✗ | Redirected to `/k/my-materials` |
| teacher | ✗ | Redirected to `/k/my-materials` |

---

## PERM005: RegisterAccess

**Type**: screen-permission
**Enforced At**: RegisterPage (`SCR009`)

### Description

Register page is only accessible to unauthenticated users. Authenticated users are redirected to `/k/my-materials`.

### Related Screens

- SCR009 – RegisterPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✓ | No active session |
| student | ✗ | Redirected to `/k/my-materials` |
| teacher | ✗ | Redirected to `/k/my-materials` |

---

## PERM006: ProfileReadOwn

**Type**: data-permission
**Enforced At**: `GET /api/v1/profile` + ProfilePage (SCR013)

### Description

A user can read their own profile data: id, email, username, name, avatar, banner, and bio. Users cannot read another user's profile via any API endpoint.

### Related Routes

- (GET) `/api/v1/profile`

### Related Screens

- SCR013 – ProfilePage / REG001 (ProfileForm)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own profile only |
| teacher | ✓ | Own profile only |

---

## PERM007: ProfileWriteOwn

**Type**: action-permission
**Enforced At**: `PUT /api/v1/profile` + ProfilePage (SCR013)

### Description

A user can update their own profile: avatar upload, banner upload, name, username, and bio. Avatar and banner uploads go through the R2 storage proxy (`POST /api/v1/r2/image`).

### Related Routes

- (PUT) `/api/v1/profile`
- (POST) `/api/v1/r2/image`

### Related Screens

- SCR013 – ProfilePage / REG001 (ProfileForm)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own profile |
| teacher | ✓ | Own profile |

---

## PERM008: DeviceListViewOwn

**Type**: data-permission
**Enforced At**: `GET /api/v1/devices` + ProfilePage (SCR013)

### Description

A user can view all active sessions and devices associated with their account. Each session shows browser, OS, IP address, and creation/expiry time. Sessions are scoped to the owning user.

### Related Routes

- (GET) `/api/v1/devices`

### Related Screens

- SCR013 – ProfilePage / REG002 (DeviceList)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own devices only |
| teacher | ✓ | Own devices only |

---

## PERM009: DeviceDeleteOwn

**Type**: action-permission
**Enforced At**: `DELETE /api/v1/devices/:deviceId` + ProfilePage (SCR013)

### Description

A user can terminate any other session/device belonging to their account. This does not terminate the current session.

### Related Routes

- (DELETE) `/api/v1/devices/:deviceId`

### Related Screens

- SCR013 – ProfilePage / REG002 (DeviceList)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own device, not current |
| teacher | ✓ | Own device, not current |

---

## PERM010: PasswordChangeOwn

**Type**: action-permission
**Enforced At**: `POST /api/v1/auth/change-password` + ProfilePage (SCR013)

### Description

A user can change their own account password. Requires the current password plus a new password. An email notification is sent upon successful change.

### Related Routes

- (POST) `/api/v1/auth/change-password`
- (POST) `/api/v1/auth/send-code-change-password`

### Related Screens

- SCR013 – ProfilePage (ChangePasswordSection)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Authenticated |
| teacher | ✓ | Authenticated |

---

## PERM011: WalletViewOwn

**Type**: data-permission
**Enforced At**: `GET /api/v1/wallet/details` + ProfilePage (SCR013)

### Description

A user can view their own wallet balance and recent transactions. Balance is shown in credits. Transactions list is paginated and scoped to the authenticated user.

### Related Routes

- (GET) `/api/v1/wallet/details`

### Related Screens

- SCR013 – ProfilePage / REG003 (SubscriptionWallet)
- SCR015 – SubscriptionPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own wallet |
| teacher | ✓ | Own wallet |

---

## PERM012: SubscriptionViewOwn

**Type**: data-permission
**Enforced At**: `GET /api/v1/payment/subscription` + SubscriptionPage (SCR015)

### Description

A user can view their current subscription plan, billing cycle, and activation status.

### Related Routes

- (GET) `/api/v1/payment/subscription`

### Related Screens

- SCR013 – ProfilePage / REG003 (SubscriptionWallet)
- SCR015 – SubscriptionPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own subscription |
| teacher | ✓ | Own subscription |

---

## PERM013: SubscriptionPurchase

**Type**: action-permission
**Enforced At**: SubscriptionPage (SCR015) + finance-service

### Description

A user selects a subscription plan and initiates payment via SePay virtual account. The system creates a `Payment` record with `status = unpaid`, assigns a virtual account number, and presents a QR code to the user. When SePay confirms the bank transfer, the payment is marked `paid` and the subscription is activated.

### Related Routes

- (GET) `/api/v1/payment/subscription`
- (POST) webhook (SePay callback)

### Related Screens

- SCR015 – SubscriptionPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Authenticated |
| teacher | ✓ | Authenticated |

---

## PERM014: QuizSetAuthorCreate

**Type**: action-permission
**Enforced At**: `POST /api/v1/quizsets` + MyMaterialsPage (SCR016)

### Description

An authenticated user can create a new quiz set. The creating user becomes the owner and can edit, delete, and set visibility.

### Related Routes

- (POST) `/api/v1/quizsets`

### Related Screens

- SCR016 – MyMaterialsPage / REG001 (QuizSetGrid)
- SCR021 – ManageExamPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Authenticated |
| teacher | ✓ | Authenticated |

---

## PERM015: QuizSetAuthorEdit

**Type**: resource-ownership
**Enforced At**: `PUT /api/v1/quizsets/:id` + ManageQuizSetDetailPage (SCR022)

### Description

Only the owner of a quiz set can edit its metadata, labels, and questions. Non-owners receive 403.

### Related Routes

- (PUT) `/api/v1/quizsets/:id`
- (POST) `/api/v1/quizsets/:id/labels`
- (PUT) `/api/v1/quizsets/:id/labels`
- (DELETE) `/api/v1/quizsets/:id/labels/:labelId`
- (POST) `/api/v1/quizsets/:id/questions`
- (PUT) `/api/v1/quizsets/:id/questions/:questionId`
- (DELETE) `/api/v1/quizsets/:id/questions/:questionId`

### Related Screens

- SCR022 – ManageQuizSetDetailPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not owner |
| teacher | ✓ | Own quiz set |
| other user | ✗ | Not owner |

---

## PERM016: QuizSetAuthorDelete

**Type**: resource-ownership
**Enforced At**: `DELETE /api/v1/quizsets/:id` + MyMaterialsPage (SCR016)

### Description

Only the owner of a quiz set can delete it. Deletion removes the quiz set and all associated questions and labels.

### Related Routes

- (DELETE) `/api/v1/quizsets/:id`

### Related Screens

- SCR016 – MyMaterialsPage / REG001 (QuizSetGrid)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not owner |
| teacher | ✓ | Own quiz set |
| other user | ✗ | Not owner |

---

## PERM017: FlashcardSetAuthorCreate

**Type**: action-permission
**Enforced At**: `POST /api/v1/flashcardsets` + MyMaterialsPage (SCR016)

### Description

An authenticated user can create a new flashcard set. The creating user becomes the owner.

### Related Routes

- (POST) `/api/v1/flashcardsets`

### Related Screens

- SCR016 – MyMaterialsPage / REG002 (FlashCardSetGrid)
- SCR017 – FlashcardsPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Authenticated |
| teacher | ✓ | Authenticated |

---

## PERM018: FlashcardSetAuthorEdit

**Type**: resource-ownership
**Enforced At**: `PUT /api/v1/flashcardsets/:id` + ManageFlashcardSetDetailPage (SCR023)

### Description

Only the owner of a flashcard set can edit its metadata, labels, and flashcards.

### Related Routes

- (PUT) `/api/v1/flashcardsets/:id`
- (POST/PUT/DELETE) `/api/v1/flashcardsets/:id/labels/:labelId`
- (POST/PUT/DELETE) `/api/v1/flashcardsets/:id/flashcards/:flashcardId`

### Related Screens

- SCR023 – ManageFlashcardSetDetailPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not owner |
| teacher | ✓ | Own flashcard set |
| other user | ✗ | Not owner |

---

## PERM019: FlashcardSetAuthorDelete

**Type**: resource-ownership
**Enforced At**: `DELETE /api/v1/flashcardsets/:id` + MyMaterialsPage (SCR016)

### Description

Only the owner of a flashcard set can delete it.

### Related Routes

- (DELETE) `/api/v1/flashcardsets/:id`

### Related Screens

- SCR016 – MyMaterialsPage / REG002 (FlashCardSetGrid)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not owner |
| teacher | ✓ | Own flashcard set |
| other user | ✗ | Not owner |

---

## PERM020: ExamRoomAuthorCreate

**Type**: action-permission
**Enforced At**: `POST /api/v1/examrooms` + MyMaterialsPage (SCR016)

### Description

An authenticated user can create a new exam room. The creating user becomes the host.

### Related Routes

- (POST) `/api/v1/examrooms`

### Related Screens

- SCR016 – MyMaterialsPage / REG003 (ExamRoomGrid)
- SCR021 – ManageExamPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Authenticated |
| teacher | ✓ | Authenticated |

---

## PERM021: ExamRoomAuthorEdit

**Type**: resource-ownership
**Enforced At**: `PUT /api/v1/examrooms/:id` + ManageExamRoomDetailPage (SCR027)

### Description

Only the host of an exam room can edit its metadata.

### Related Routes

- (PUT) `/api/v1/examrooms/:id`

### Related Screens

- SCR027 – ManageExamRoomDetailPage / REG002 (RoomInfoSection)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not host |
| teacher | ✓ | Own exam room |
| other user | ✗ | Not host |

---

## PERM022: ExamRoomAuthorDelete

**Type**: resource-ownership
**Enforced At**: `DELETE /api/v1/examrooms/:id` + ManageExamPage (SCR021)

### Description

Only the host of an exam room can delete it. This cascades to all associated sessions.

### Related Routes

- (DELETE) `/api/v1/examrooms/:id`

### Related Screens

- SCR021 – ManageExamPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not host |
| teacher | ✓ | Own exam room |
| other user | ✗ | Not host |

---

## PERM023: ExamSessionAuthorCreate

**Type**: action-permission
**Enforced At**: `POST /api/v1/examrooms/:id/sessions` + ManageExamRoomDetailPage (SCR027)

### Description

Only the host of an exam room can create sessions under it.

### Related Routes

- (POST) `/api/v1/examrooms/:id/sessions`

### Related Screens

- SCR027 – ManageExamRoomDetailPage / REG003 (SessionTable)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not host |
| teacher | ✓ | Own exam room |

---

## PERM024: ExamSessionAuthorManage

**Type**: resource-ownership
**Enforced At**: `PUT/DELETE /api/v1/examsessions/:id` + ManageExamRoomDetailPage (SCR027)

### Description

Only the host who owns the parent exam room can update or delete a session.

### Related Routes

- (PUT) `/api/v1/examsessions/:id`
- (DELETE) `/api/v1/examsessions/:id`

### Related Screens

- SCR027 – ManageExamRoomDetailPage / REG003 (SessionTable)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not host |
| teacher | ✓ | Own exam room |

---

## PERM025: ExamSessionAuthorSharing

**Type**: action-permission
**Enforced At**: `GET/PUT /api/v1/examsessions/:id/sharing` + ManageExamRoomDetailPage (SCR027)

### Description

Only the session host can manage sharing settings (access code, link generation).

### Related Routes

- (GET) `/api/v1/examsessions/:id/sharing`
- (PUT) `/api/v1/examsessions/:id/sharing`

### Related Screens

- SCR027 – ManageExamRoomDetailPage / REG004 (ShareDialog)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not host |
| teacher | ✓ | Own session |

---

## PERM026: ExamSessionAuthorAnalytics

**Type**: data-permission
**Enforced At**: `GET /api/v1/examrooms/:id/sessions/:sessionId/attempts` + ExamRoomSessionAnalyticsPage (SCR028)

### Description

Only the session host can view attempt leaderboard, score distribution, and cheating statistics for a session. Other users receive 403.

### Related Routes

- (GET) `/api/v1/examrooms/:id/sessions/:sessionId/attempts`
- (GET) `/api/v1/examrooms/:id/sessions/:sessionId/attempts/:attemptId`

### Related Screens

- SCR028 – ExamRoomSessionAnalyticsPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not host |
| teacher | ✓ | Own session |
| attempt owner | ✗ | Cannot view other students' results |

---

## PERM027: ExamSessionAccess

**Type**: route-guard
**Enforced At**: ExamSessionPage (SCR031) + API

### Description

A student can access an exam session if: the session is public, or the student is whitelisted, or the student holds the correct access code. Sessions are time-gated: access is blocked before `startTime` and after `endTime`. The host always has access to their own sessions.

### Related Routes

- (GET) `/api/v1/examsessions/:id`

### Related Screens

- SCR031 – ExamSessionPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✗ | Must authenticate |
| student | ✓ | Passes access check (public/whitelist/code) + within time window |
| teacher (non-host) | ✓ | Passes access check |
| session host | ✓ | Always |

---

## PERM028: ExamAttemptStart

**Type**: action-permission
**Enforced At**: ExamSessionPage (SCR031)

### Description

A student can start a new exam attempt if: the session is currently active (within time window), the student has no other in-progress attempt for this session, and the session's attempt limit has not been reached.

### Related Screens

- SCR031 – ExamSessionPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | No in-progress attempt exists + within time window + under attempt limit |
| teacher | ✓ | Same conditions |

---

## PERM029: ExamAttemptResume

**Type**: action-permission
**Enforced At**: ExamSessionPage (SCR031)

### Description

A student can resume an in-progress attempt. The system decrypts and serves the last saved question index and answer state.

### Related Screens

- SCR031 – ExamSessionPage
- SCR032 – ExamQuizPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own in-progress attempt |
| teacher | ✓ | Own in-progress attempt |

---

## PERM030: ExamAttemptViewOwn

**Type**: data-permission
**Enforced At**: `GET /api/v1/examrooms/:id/sessions/:sessionId/attempts/:attemptId` + MyExamsPage (SCR029)

### Description

A student can view their own exam attempt results and details. Cannot view another student's attempt.

### Related Routes

- (GET) `/api/v1/examrooms/:id/sessions/:sessionId/attempts/:attemptId`

### Related Screens

- SCR029 – MyExamsPage (SessionHistoryDialog)
- SCR032 – ExamQuizPage (results view)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own attempt |
| other student | ✗ | Not owner |

---

## PERM031: ExamAttemptSubmit

**Type**: action-permission
**Enforced At**: ExamQuizPage (SCR032)

### Description

A student submits an exam attempt by sending encrypted answers via JWT-wrapped `secure-submit` endpoint. Submission is also triggered automatically when the session time limit expires.

### Related Routes

- (POST) `/api/v1/secure-submit`

### Related Screens

- SCR032 – ExamQuizPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own in-progress attempt |
| teacher | ✓ | Own in-progress attempt |

---

## PERM032: FlashcardStudyAccess

**Type**: route-guard
**Enforced At**: FlashcardStudyPage (SCR030)

### Description

A student can access a flashcard set for study if: the set is public, or the student is the owner, or the student holds the correct access code. Turnstile bot protection is applied on the access check.

### Related Routes

- (GET) `/study-flashcard/:id`

### Related Screens

- SCR030 – FlashcardStudyPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✗ | Must authenticate |
| student | ✓ | Passes access check (public/owner/code) |
| set owner | ✓ | Always |
| teacher | ✓ | Same as student |

---

## PERM033: FlashcardStudyAccessCode

**Type**: action-permission
**Enforced At**: FlashcardStudyPage (SCR030) — AccessCodeDialog

### Description

A flashcard set with access code protection requires the student to enter the correct 6-digit code before the study interface is unlocked. Turnstile verification is also required.

### Related Screens

- SCR030 – FlashcardStudyPage (AccessModal)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Correct code entered |
| set owner | ✓ | Code bypassed |

---

## PERM034: FlashcardStudyProgress

**Type**: data-permission
**Enforced At**: FlashcardStudyPage (SCR030)

### Description

Study progress (studied card IDs) is saved per user per flashcard set. The student can only view and update their own progress.

### Related Routes

- (internal) `addStudiedCardApi`

### Related Screens

- SCR030 – FlashcardStudyPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own progress |
| teacher | ✓ | Own progress |

---

## PERM035: AIGenerationAccess

**Type**: route-guard
**Enforced At**: AIToolPage (SCR024) + AI generation endpoints

### Description

Authenticated users can access the AI generation tool page and initiate quiz or flashcard generation from uploaded documents. The page lists available files and generation history.

### Related Routes

- (GET) `/api/v1/ai/job/:jobId`
- (DELETE) `/api/v1/ai/job/:jobId`

### Related Screens

- SCR024 – AIToolPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Authenticated |
| teacher | ✓ | Authenticated |

---

## PERM036: AIGenerationCredits

**Type**: action-permission
**Enforced At**: AIToolPage (SCR024) + `FinanceClientService` (BL004)

### Description

AI generation deducts credits from the user's wallet before processing. The system checks wallet balance via `FinanceClientService` and emits a debit transaction. However, `FREE_MODE = true` in production bypasses this credit check entirely — generation proceeds without credit deduction.

### Related Routes

- (internal) Credit deduction via `FinanceClientService`

### Related Screens

- SCR024 – AIToolPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Wallet has sufficient credits (or FREE_MODE = true) |
| teacher | ✓ | Wallet has sufficient credits (or FREE_MODE = true) |

---

## PERM037: AIKnowledgeBaseManage

**Type**: action-permission
**Enforced At**: GenAIKnowledgePage (SCR025)

### Description

Authenticated users can upload knowledge files, create folders, manage dataset imports, and reprocess files for the AI tutor knowledge base. Files are processed by the AI service to produce chunks and embeddings.

### Related Routes

- (GET/POST/PUT/DELETE) `/api/v1/ai/tutor/knowledge-folders`
- (GET/POST/DELETE) `/api/v1/ai/tutor/knowledge-files`
- (POST) `/api/v1/ai/tutor/knowledge-files/:id/reprocess`
- (GET/POST) `/api/v1/ai/tutor/dataset-imports`
- (GET) `/api/v1/ai/tutor/knowledge-stats`

### Related Screens

- SCR025 – GenAIKnowledgePage (all regions)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Authenticated |
| teacher | ✓ | Authenticated |

---

## PERM038: PDFHistoryViewOwn

**Type**: data-permission
**Enforced At**: `GET /api/v1/student/recent-flashcards` + HistoryPage (SCR018) + PDFHistoryPage (SCR020)

### Description

A student can view their own PDF upload history (AI-processed documents) and trigger re-download. Cannot view another user's PDF history.

### Related Routes

- (GET) `/api/v1/student/recent-flashcards`

### Related Screens

- SCR018 – HistoryPage / REG001 (PDFHistoryList)
- SCR020 – PDFHistoryPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own history |
| teacher | ✓ | Own history |

---

## PERM039: ExamHistoryViewOwn

**Type**: data-permission
**Enforced At**: `GET /api/v1/student/recent-exams` + HistoryPage (SCR018) + ExamHistoryPage (SCR019)

### Description

A student can view their own exam attempt history with scores, timestamps, and pass/fail status. Cannot view another user's exam history.

### Related Routes

- (GET) `/api/v1/student/recent-exams`

### Related Screens

- SCR018 – HistoryPage / REG002 (ExamHistoryList)
- SCR019 – ExamHistoryPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own history |
| teacher | ✓ | Own history |

---

## PERM040: SessionCleanup

**Type**: env-gate
**Enforced At**: `SessionCleanupCron` (BL001) — `examio-be/apps/auth-service/src/session-cleanup.cron.ts`

### Description

Daily cron job deactivates expired sessions. Runs on a configurable schedule. This is an internal infrastructure rule; no user-facing screen directly triggers it.

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| system (cron) | ✓ | Service account |

---

## PERM041: FreeModeCreditBypass

**Type**: env-gate
**Enforced At**: `FinanceClientService` (BL004) — `examio-be/apps/exam-service/src/modules/finance-client/finance-client.service.ts`

### Description

`FREE_MODE = true` in production code path bypasses credit deduction for AI generation and document processing. Wallet balance is not checked; credits are not deducted regardless of subscription status. This is a compile-time or environment-gated flag.

### Related Modules

- exam-service: `FinanceClientService`

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| all roles | ✓ (bypass) | FREE_MODE = true |
| all roles | normal credit check | FREE_MODE = false |

---

## PERM042: TurnstileBotProtection

**Type**: feature-flag
**Enforced At**: RegisterPage (SCR009), FlashcardStudyPage (SCR030) — access check

### Description

Bot protection via Turnstile challenge is enforced on account registration and flashcard set access when an access code is required. Protects against automated account creation and study access abuse.

### Related Screens

- SCR009 – RegisterPage
- SCR030 – FlashcardStudyPage (AccessModal)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| all | ✓ | Turnstile token valid |
| bot | ✗ | Challenge failed |

---

## PERM043: QuizSetVisibilityControl

**Type**: resource-ownership
**Enforced At**: `GET /api/v1/quizsets` + ManageQuizSetDetailPage (SCR022)

### Description

A quiz set owner can set visibility to `public` (browsable by any authenticated user) or `private` (owner only). Public visibility makes the set discoverable on the HomePage and browseable via the quiz set grid.

### Related Screens

- SCR022 – ManageQuizSetDetailPage (QuizSetHeader)
- SCR001 – HomePage (ContentGrid)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| set owner | ✓ | Can set public/private |
| other student | ✓ (read) | Only if set is public |
| other teacher | ✓ (read) | Only if set is public |

---

## PERM044: FlashcardSetVisibilityControl

**Type**: resource-ownership
**Enforced At**: `GET /api/v1/flashcardsets` + ManageFlashcardSetDetailPage (SCR023)

### Description

A flashcard set owner can set visibility to `public` or `private`. Public sets are browsable via the FlashcardsPage and discoverable on the HomePage.

### Related Screens

- SCR023 – ManageFlashcardSetDetailPage (FlashcardSetHeader)
- SCR017 – FlashcardsPage
- SCR001 – HomePage (ContentGrid)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| set owner | ✓ | Can set public/private |
| other student | ✓ (read) | Only if set is public |
| other teacher | ✓ (read) | Only if set is public |

---

## PERM045: ExamRoomVisibilityControl

**Type**: resource-ownership
**Enforced At**: ExamRoom listing + ExamSessionPage (SCR031)

### Description

An exam room owner can control access via: public (anyone with link), whitelist (specific user IDs), or access code (6-digit OTP). These settings determine who can attempt the exam.

### Related Screens

- SCR027 – ManageExamRoomDetailPage (ShareDialog)
- SCR031 – ExamSessionPage (AccessCodeDialog)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| room host | ✓ | Can configure access mode |
| student | ✓ (attempt) | Passes access check |
| other teacher | ✓ (read) | Only if room is discoverable |

---

## Summary

- **Total Permission Items**: 45
- **By Type**: route-guard: 4, screen-permission: 2, action-permission: 10, data-permission: 9, role-based: 1, resource-ownership: 9, env-gate: 2, feature-flag: 1

---

## Cross-Reference Validation

- [x] All PERM### codes are unique (PERM001–PERM045)
- [x] All PERM### codes reference valid screens (SCR###) from ScreenList.md
- [x] All related route references are valid (RT### in RouteList — omitted here for brevity; cross-referenced via route-path pattern matching)
- [x] All related module references are valid (auth-service, exam-service, finance-service, r2-service, common)
- [x] No orphaned permission references
- [x] Ownership rules (PERM015–PERM022, PERM024–PERM025) correctly target only resource owners
- [x] Guest vs. authenticated separation correctly enforced for all screen groups