# Feature List

**Project**: kmaedu
**Generated**: 2026-06-05
**Analysis Scope**: All 32 frontend screens + permissions matrix + user stories + background logic inventory

**Code Format**: All codes MUST follow `F###_NameSlug` format (e.g., F001_Auth, F002_UserProfile)
**Screen Code Format**: All screen codes MUST follow `SCR###_NameSlug` format (e.g., SCR001_LoginForm)
**User Story Code Format**: All US codes MUST follow `US###_NameSlug` format (e.g., US001_Login)
**Background Logic Code Format**: All BL codes MUST follow `BL###_NameSlug` format (e.g., BL001_ScheduledReport)
**Permission Code Format**: All PERM codes MUST follow `PERM###_NameSlug` format (e.g., PERM001_ViewReports)

**Feature Types**:
- `ui` - Feature has UI screens (SCR###)
- `background` - Feature only has background logic (BL###, no SCR###)
- `mixed` - Feature has both UI screens and background logic

**Related Screens column format**: Accepts `SCR###`, `SCR###/REG###`, or mixed comma-separated (e.g., `SCR001, SCR002/REG003`). Tokenizer splits on `,` then on `/`. No intra-screen shorthand (`SCR###/REG001+REG002` invalid) — enumerate each ref explicitly.

**Partial-screen ownership note**: A feature with only a `SCR###/REG###` ref owns the region, NOT the parent SCR. The screen shell (`SCR###`) must be owned by a separate F### with a bare `SCR###` ref (typically a layout/dashboard feature).

**Cross-reference**: See ScreenList Regions subsection for region definitions and the `REG###_NameSlug` registry.

## Feature Hierarchy

**Note**: Features are sorted by priority from highest to lowest (P0 → P1 → P2 → P3). Priority levels:
- **P0**: Core functionality, blocking issues, or essential features
- **P1**: High priority, significant features
- **P2**: Medium priority, standard features
- **P3**: Low priority, nice-to-have features

| Code | Name | Type | Language | Workspace | Priority |
|------|------|------|----------|-----------|----------|
| F001 | PublicLanding | ui | TypeScript | kmaedu-fe | P1 |
| F002 | Authentication | ui | TypeScript | kmaedu-fe | P0 |
| F003 | AccountManagement | ui | TypeScript | kmaedu-fe | P0 |
| F004 | ProfileManagement | ui | TypeScript | kmaedu-fe | P1 |
| F005 | Finance (REMOVED 2026-11-10) | ui | TypeScript | kmaedu-fe | P1 |
| F006 | QuizAuthoring | ui | TypeScript | kmaedu-fe | P1 |
| F007 | FlashcardAuthoring | ui | TypeScript | kmaedu-fe | P1 |
| F008 | ExamHosting | ui | TypeScript | kmaedu-fe | P1 |
| F009 | AITeacherKnowledgeBase (REMOVED 2026-06-14) | ui | TypeScript | kmaedu-fe | P1 |
| F010 | AITool | ui | TypeScript | kmaedu-fe | P1 |
| F011 | FlashcardStudy | ui | TypeScript | kmaedu-fe | P1 |
| F012 | ExamTaking | ui | TypeScript | kmaedu-fe | P0 |
| F013 | SessionCleanup | background | TypeScript | kmaedu-be | P2 |
| F014 | AdminDashboard | ui | TypeScript | kmaedu-fe + kmaedu-be | P1 |
| F015 | PageFeatureFlags | ui | TypeScript | kmaedu-fe + kmaedu-be | P1 |
| F016 | WordFamily | ui | TypeScript | kmaedu-fe + kmaedu-be | P2 |

## Feature Details

### F001: PublicLanding

**Type**: ui
**Description**: Public landing page for unauthenticated and authenticated users. Displays featured quiz sets, flashcard sets, and exam rooms with browse/search capability. Includes static informational pages (About, Contact, Legal).

**Workspace**: kmaedu-fe
**Languages**: TypeScript
**Components**: 12

**Related Screens**:
- SCR001: HomePage
- SCR002: AboutPage
- SCR003: ContactPage
- SCR004: TermsPage
- SCR005: PrivacyPage
- SCR006: CookiesPage
- SCR007: SecurityPage

**Related User Stories**:
- US001: Browse Platform Content
- US002: Submit Contact Form

**Related APIs/Routes**:
- (GET) `/`
- (GET) `/about`
- (GET) `/contact`
- (GET) `/terms`
- (GET) `/privacy`
- (GET) `/cookies`
- (GET) `/security`
- (POST) `/api/v1/contact`

**Related Data Models**:
- QuizSet
- FlashCardSet
- ExamRoom

**Related Background Logic**:
- (none)

**Related Permissions**:
- PERM001: PublicRouteAccess

---

### F002: Authentication

**Type**: ui
**Description**: Full authentication flow including email/password login, Google OAuth (One Tap), account registration with Turnstile bot protection, and session management with device tracking.

**Workspace**: kmaedu-fe
**Languages**: TypeScript
**Components**: 8

**Related Screens**:
- SCR008: LoginPage
- SCR009: RegisterPage
- SCR010: ForgotPasswordPage
- SCR011: ResetPasswordPage

**Related User Stories**:
- US003: Sign In with Email
- US004: Sign In with Google OAuth
- US005: Register Account
- US006: Request Password Reset
- US007: Reset Password with OTP

**Related APIs/Routes**:
- (POST) `/api/v1/auth/login`
- (GET) `/api/v1/auth/google`
- (POST) `/api/v1/auth/google/one-tap`
- (POST) `/api/v1/auth/register`
- (POST) `/api/v1/auth/send-code-reset-password`
- (POST) `/api/v1/auth/reset-password`
- (POST) `/api/v1/auth/refresh`
- (POST) `/api/v1/auth/logout`
- (POST) `/api/v1/auth/sync-refresh-token`

**Related Data Models**:
- User
- UserSession
- VerifyCode
- ResetCode

**Related Background Logic**:
- (none)

**Related Permissions**:
- PERM004: LoginAccess
- PERM005: RegisterAccess
- PERM042: TurnstileBotProtection

---

### F003: AccountManagement

**Type**: ui
**Description**: Account lifecycle management: email verification (OTP), unverified account gating, and root redirect logic for protected `/k/` section.

**Workspace**: kmaedu-fe
**Languages**: TypeScript
**Components**: 3

**Related Screens**:
- SCR012: KRootRedirect
- SCR014: VerifyPage

**Related User Stories**:
- US011: Verify Account

**Related APIs/Routes**:
- (POST) `/api/v1/auth/verifyAccount`
- (POST) `/api/v1/auth/sendVerificationEmail`
- (GET) `/api/v1/auth/me`
- (GET) `/k`

**Related Data Models**:
- User
- VerifyCode

**Related Background Logic**:
- (none)

**Related Permissions**:
- PERM002: AuthenticatedRouteAccess
- PERM003: UnverifiedAccountGate

---

### F004: ProfileManagement

**Type**: ui
**Description**: User profile management including avatar/banner upload via R2 storage proxy, username/name/bio editing, password change with email notification, and session/device termination.

**Workspace**: kmaedu-fe
**Languages**: TypeScript
**Components**: 6

**Related Screens**:
- SCR013/REG001: ProfilePage / ProfileForm
- SCR013/REG002: ProfilePage / DeviceList

**Related User Stories**:
- US008: Update Profile
- US009: Change Account Password
- US010: Terminate Session

**Related APIs/Routes**:
- (GET) `/api/v1/profile`
- (PUT) `/api/v1/profile`
- (POST) `/api/v1/r2/image`
- (GET) `/api/v1/devices`
- (DELETE) `/api/v1/devices/:deviceId`
- (POST) `/api/v1/auth/change-password`
- (POST) `/api/v1/auth/send-code-change-password`

**Related Data Models**:
- User
- UserSession

**Related Background Logic**:
- (none)

**Related Permissions**:
- PERM002: AuthenticatedRouteAccess
- PERM003: UnverifiedAccountGate
- PERM006: ProfileReadOwn
- PERM007: ProfileWriteOwn
- PERM008: DeviceListViewOwn
- PERM009: DeviceDeleteOwn
- PERM010: PasswordChangeOwn

---

### F005: Finance (REMOVED 2026-11-10)

> **REMOVED 2026-11-10.** The wallet / subscription / payment feature was removed from the product (finance-service, SePay, credits, subscription tiers, the SubscriptionPage and admin finance page). The feature folder `docs/features/F005_Finance` was deleted. Retired codes (not reused): F005, US012, SCR015, SCR036, REG003 of SCR013, MODEL-005, MODEL-006, MODEL-026..028, PERM011..013, PERM036, PERM041, PERM049..051, BL002, BL004, BL010, BL011, FLOW001, FLOW002, FLOW006.

---

### F006: QuizAuthoring

**Type**: ui
**Description**: Quiz set full lifecycle: create, edit, delete, visibility control. Question and label CRUD within quiz sets. PDF history management (view, download, delete). AI quiz generation from documents. Stats aggregation.

**Workspace**: kmaedu-fe
**Languages**: TypeScript
**Components**: 14

**Related Screens**:
- SCR016/REG001: MyMaterialsPage / QuizSetGrid
- SCR018/REG001: HistoryPage / PDFHistoryList
- SCR020: PDFHistoryPage
- SCR021: ManageExamPage
- SCR022: ManageQuizSetDetailPage
- SCR024: AIToolPage (quiz generation portion)
- QuizPracticePage (`/k/practice-quiz/:id`, phase 07; student practice on shared quiz sets, no SCR code assigned yet)
- ShareQuizSetModal (phase 07; owner sharing dialog on ManageQuizSetDetailPage)
- SCR017: FlashcardsPage (FlashcardSetModal for quiz-authoring context)

**Related User Stories**:
- US013: Create Quiz Set
- US014: Edit Quiz Set
- US015: Delete Quiz Set
- US023: Generate Flashcards via AI
- US024: View PDF History
- US025: Delete PDF History Record
- US028: Manage Quiz Set Labels
- US029: Add Question to Quiz Set
- US030: Edit Question in Quiz Set
- US031: Delete Question from Quiz Set
- US036: Generate Quiz via AI
- US037: Manage AI Generation Jobs

**Related APIs/Routes**:
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
- (GET) `/api/v1/student/recent-flashcards`
- (DELETE) `/api/v1/student/recent-flashcards`
- (GET) `/api/v1/quizsets/stats`
- (GET) `/api/v1/quizsets/users/search`
- (GET|PUT) `/api/v1/quizsets/:id/sharing`
- (POST) `/api/v1/quizsets/:id/generate-code`
- (GET) `/api/v1/quiz-practice/sets`
- (GET) `/api/v1/quiz-practice/sets/:id/access`
- (POST) `/api/v1/quiz-practice/sets/:id/unlock`
- (POST|GET) `/api/v1/quiz-practice/attempts`
- (GET|PUT) `/api/v1/quiz-practice/attempts/:id`
- (POST) `/api/v1/quiz-practice/attempts/:id/submit`
- (POST) `/api/v1/ai/job`
- (GET) `/api/v1/ai/job/:jobId`
- (DELETE) `/api/v1/ai/job/:jobId`

**Related Data Models**:
- QuizSet
- QuizQuestion
- QuizSetLabel
- UserStorage
- HistoryGeneratedQuizz
- HistoryGeneratedFlashcard

**Related Background Logic**:
- (none)

**Related Permissions**:
- PERM002: AuthenticatedRouteAccess
- PERM003: UnverifiedAccountGate
- PERM014: QuizSetAuthorCreate
- PERM015: QuizSetAuthorEdit
- PERM016: QuizSetAuthorDelete
- PERM035: AIGenerationAccess
- PERM038: PDFHistoryViewOwn
- PERM043: QuizSetVisibilityControl

---

### F007: FlashcardAuthoring

**Type**: ui
**Description**: Flashcard set full lifecycle: create, edit, delete, visibility control. Label and flashcard CRUD within sets. AI flashcard generation from documents.

**Workspace**: kmaedu-fe
**Languages**: TypeScript
**Components**: 12

**Related Screens**:
- SCR016/REG002: MyMaterialsPage / FlashCardSetGrid
- SCR017: FlashcardsPage
- SCR023: ManageFlashcardSetDetailPage

**Related User Stories**:
- US016: Create Flashcard Set
- US017: Edit Flashcard Set
- US018: Delete Flashcard Set
- US022: Browse Flashcard Sets
- US023: Generate Flashcards via AI
- US032: Manage Flashcard Set Labels
- US033: Add Flashcard to Set
- US034: Edit Flashcard in Set
- US035: Delete Flashcard from Set
- US036: Generate Quiz via AI
- US037: Manage AI Generation Jobs

**Related APIs/Routes**:
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
- (POST) `/api/v1/ai/job`
- (GET) `/api/v1/ai/job/:jobId`
- (DELETE) `/api/v1/ai/job/:jobId`

**Related Data Models**:
- FlashCardSet
- FlashCard
- FlashCardSetLabel
- HistoryGeneratedFlashcard

**Related Background Logic**:
- (none)

**Related Permissions**:
- PERM002: AuthenticatedRouteAccess
- PERM003: UnverifiedAccountGate
- PERM017: FlashcardSetAuthorCreate
- PERM018: FlashcardSetAuthorEdit
- PERM019: FlashcardSetAuthorDelete
- PERM035: AIGenerationAccess
- PERM044: FlashcardSetVisibilityControl

---

### F008: ExamHosting

**Type**: ui
**Description**: Exam room and session full lifecycle for teachers: create/edit/delete rooms, create/edit/delete sessions, configure sharing/access control (public/whitelist/code), view session analytics (leaderboard, score distribution, cheating stats), and manage attempt history.

**Workspace**: kmaedu-fe
**Languages**: TypeScript
**Components**: 16

**Related Screens**:
- SCR016/REG003: MyMaterialsPage / ExamRoomGrid
- SCR018/REG002: HistoryPage / ExamHistoryList
- SCR018/REG003: HistoryPage / StatsCards
- SCR019: ExamHistoryPage
- SCR021: ManageExamPage
- SCR026: ManageExamRoomPage
- SCR027/REG001: ManageExamRoomDetailPage / StatsGrid
- SCR027/REG002: ManageExamRoomDetailPage / RoomInfoSection
- SCR027/REG003: ManageExamRoomDetailPage / SessionTable
- SCR027/REG004: ManageExamRoomDetailPage / ShareDialog
- SCR028: ExamRoomSessionAnalyticsPage
- SCR029: MyExamsPage
- SCR031: ExamSessionPage

**Related User Stories**:
- US019: Create Exam Room
- US020: Edit Exam Room
- US021: Delete Exam Room
- US026: View Exam History
- US027: View Study Statistics
- US044: View Exam Room Detail
- US045: Create Exam Session
- US046: Edit Exam Session
- US047: Delete Exam Session
- US048: Configure Session Sharing
- US049: View Session Analytics
- US050: View Session Attempt Detail
- US051: Browse Exam Sessions
- US052: View Attempt History
- US056: Enter Exam Session
- US057: Enter Session Access Code
- US058: Start Exam Attempt
- US059: Resume Exam Attempt

**Related APIs/Routes**:
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
- (GET) `/api/v1/student/recent-exams`
- (POST) `/api/v1/secure-quiz`
- (POST) `/api/v1/secure-submit`
- (PUT) `/api/v1/examattempts/:attemptId/progress`
- (POST) `/api/v1/cheatinglogs`

**Related Data Models**:
- ExamRoom
- ExamSession
- ExamAttempt
- CheatingLog

**Related Background Logic**:
- (none)

**Related Permissions**:
- PERM002: AuthenticatedRouteAccess
- PERM003: UnverifiedAccountGate
- PERM020: ExamRoomAuthorCreate
- PERM021: ExamRoomAuthorEdit
- PERM022: ExamRoomAuthorDelete
- PERM023: ExamSessionAuthorCreate
- PERM024: ExamSessionAuthorManage
- PERM025: ExamSessionAuthorSharing
- PERM026: ExamSessionAuthorAnalytics
- PERM027: ExamSessionAccess
- PERM028: ExamAttemptStart
- PERM029: ExamAttemptResume
- PERM030: ExamAttemptViewOwn
- PERM031: ExamAttemptSubmit
- PERM039: ExamHistoryViewOwn
- PERM045: ExamRoomVisibilityControl

---

### F009: AITeacherKnowledgeBase (REMOVED 2026-06-14)

> **REMOVED 2026-06-14.** Frontend page removed in `f1ed596`, backend `ai-tutor` module in `343fa97`; see `docs/features/F009_AITeacherKnowledgeBase/technical-spec.md`. Retired codes: FR-009_01..11, US038..043, SCR025, REG001..004. Entries below are historical.

**Type**: ui
**Description**: AI tutor knowledge base management: knowledge folder CRUD, knowledge file upload/processing/reprocessing/delete, dataset import jobs, and knowledge statistics display.

**Workspace**: kmaedu-fe
**Languages**: TypeScript
**Components**: 10

**Related Screens**:
- SCR025/REG001: GenAIKnowledgePage / FolderPanel (removed)
- SCR025/REG002: GenAIKnowledgePage / FilePanel (removed)
- SCR025/REG003: GenAIKnowledgePage / DatasetImportPanel (removed)
- SCR025/REG004: GenAIKnowledgePage / StatsPanel (removed)

**Related User Stories**:
- US038: Manage Knowledge Folders
- US039: Upload Knowledge File
- US040: Reprocess Knowledge File
- US041: Delete Knowledge File
- US042: Import Dataset
- US043: View Knowledge Statistics

**Related APIs/Routes**:
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

**Related Data Models**:
- UserStorage
- Document
- UserStorageGraph
- UserStorageGraphGroup
- AIChat

**Related Background Logic**:
- (none)

**Related Permissions**:
- PERM002: AuthenticatedRouteAccess
- PERM003: UnverifiedAccountGate
- PERM037: AIKnowledgeBaseManage

---

### F010: AITool

**Type**: ui
**Description**: AI content generation tool for creating quizzes and flashcards from uploaded documents. Job status polling and cancellation. Not charged: there is no wallet or credit check, and cost is guarded only by the gateway rate limits.

**Workspace**: kmaedu-fe
**Languages**: TypeScript
**Components**: 5

**Related Screens**:
- SCR024: AIToolPage

**Related User Stories**:
- US023: Generate Flashcards via AI
- US036: Generate Quiz via AI
- US037: Manage AI Generation Jobs

**Related APIs/Routes**:
- (POST) `/api/v1/ai/job`
- (GET) `/api/v1/ai/job/:jobId`
- (DELETE) `/api/v1/ai/job/:jobId`

**Related Data Models**:
- UserStorage
- HistoryGeneratedQuizz
- HistoryGeneratedFlashcard

**Related Background Logic**:
- (none)

**Related Permissions**:
- PERM002: AuthenticatedRouteAccess
- PERM003: UnverifiedAccountGate
- PERM035: AIGenerationAccess

---

### F011: FlashcardStudy

**Type**: ui
**Description**: Flashcard study interface with flip animation, keyboard navigation, sound effects, shuffle, and progress tracking. Access-gated (Turnstile + optional access code). Progress auto-saved per user per set.

**Workspace**: kmaedu-fe
**Languages**: TypeScript
**Components**: 5

**Related Screens**:
- SCR030: FlashcardStudyPage

**Related User Stories**:
- US053: Access Flashcard Study
- US054: Enter Flashcard Access Code
- US055: Study Flashcards

**Related APIs/Routes**:
- (GET) `/study-flashcard/:id`
- (addStudiedCardApi) internal progress save

**Related Data Models**:
- FlashCardSet
- FlashCard
- FlashcardStudyProgress

**Related Background Logic**:
- (none)

**Related Permissions**:
- PERM002: AuthenticatedRouteAccess
- PERM003: UnverifiedAccountGate
- PERM032: FlashcardStudyAccess
- PERM033: FlashcardStudyAccessCode
- PERM034: FlashcardStudyProgress
- PERM042: TurnstileBotProtection

---

### F012: ExamTaking

**Type**: ui
**Description**: Active exam-taking interface: encrypted question fetch and client-side AES-256-CBC decryption, answer selection, auto-save every 30s via background polling, cheating detection (tab switch, window blur, devtools, copy-paste), and secure answer submission via JWT-wrapped endpoint.

**Workspace**: kmaedu-fe
**Languages**: TypeScript
**Components**: 6

**Related Screens**:
- SCR032: ExamQuizPage

**Related User Stories**:
- US058: Start Exam Attempt
- US059: Resume Exam Attempt
- US060: Answer Exam Question
- US061: Submit Exam Attempt
- US062: View Own Exam Results

**Related APIs/Routes**:
- (POST) `/api/v1/secure-quiz`
- (POST) `/api/v1/secure-submit`
- (PUT) `/api/v1/examattempts/:attemptId/progress`
- (POST) `/api/v1/cheatinglogs`
- (GET) `/api/v1/examrooms/:id/sessions/:sessionId/attempts/:attemptId`

**Related Data Models**:
- ExamAttempt
- QuizQuestion
- CheatingLog

**Related Background Logic**:
- BL005: CheatingDetectionHook

**Related Permissions**:
- PERM002: AuthenticatedRouteAccess
- PERM003: UnverifiedAccountGate
- PERM027: ExamSessionAccess
- PERM028: ExamAttemptStart
- PERM029: ExamAttemptResume
- PERM030: ExamAttemptViewOwn
- PERM031: ExamAttemptSubmit

---

### F013: SessionCleanup

**Type**: background
**Description**: Daily cron job that deactivates expired user sessions. Runs on a configurable schedule. Enforced via service account; no user-facing screen directly triggers it.

**Workspace**: kmaedu-be
**Languages**: TypeScript
**Components**: 1

**Related Screens**:
- (none)

**Related User Stories**:
- (none — system background job)

**Related APIs/Routes**:
- (none — internal cron, not HTTP)

**Related Data Models**:
- UserSession

**Related Background Logic**:
- BL001: SessionCleanupCron

**Related Permissions**:
- PERM040: SessionCleanup

---

### F014: AdminDashboard

**Type**: ui
**Description**: Admin dashboard providing privileged access to platform operations: KPI overview and analytics, user management (ban/unban), role management (`/admin/roles`), server-side log viewing with SSE streaming, and audit log query. Backed by `admin-service` (port 7006) with dedicated `AdminGuard`.

**Workspace**: kmaedu-fe + kmaedu-be
**Languages**: TypeScript
**Components**: 6 pages

**Related Screens**:
- SCR033: AdminOverviewPage
- SCR034: AdminStatsPage
- SCR035: AdminUsersPage
- SCR037: AdminLogsPage
- SCR038: AdminAuditPage
- SCR044: AdminRolesPage

**Related User Stories**:
- (none — internal operational tool; no external user stories)

**Related APIs/Routes**:
- (GET) `/api/v1/admin/bootstrap`
- (GET) `/api/v1/admin/stats`
- (GET) `/api/v1/admin/users`
- (POST) `/api/v1/admin/users/:id/ban`
- (POST) `/api/v1/admin/users/:id/unban`
- (GET) `/api/v1/admin/roles`
- (GET) `/api/v1/admin/roles/users`
- (GET) `/api/v1/admin/roles/changes`
- (PUT) `/api/v1/admin/roles/users/:id/role`
- (PUT) `/api/v1/admin/roles/users/:id/system-admin`
- (GET) `/api/v1/admin/audit`
- (GET) `/api/v1/admin/logs`
- (GET) `/api/v1/admin/logs/stream`

**Related Data Models**:
- User (isBanned, deletedAt fields added)
- AdminAudit (new)

**Related Background Logic**:
- BL001: SessionCleanupCron (admin-service also uses ThrottlerModule)

**Related Permissions**:
- PERM046: AdminRouteAccess
- PERM047: AdminUserManagement
- PERM048: AdminGrantRevoke
- PERM052: AdminAuditLogView
- PERM053: AdminLogView

---

### F015: PageFeatureFlags

**Type**: ui
**Description**: Dynamic page enable/disable system without redeployment. Admins toggle `PageFeatureFlag` rows via an admin screen; the gateway enforces the flag on proxy routes decorated with `@TogglePage(key)` (fail-open on infra errors, 404 on explicit disable); the frontend mirrors the same state via `<FeatureRoute>` and hides sidebar nav items. Changes propagate to all connected clients in real time over SSE.

**Workspace**: kmaedu-fe + kmaedu-be
**Languages**: TypeScript
**Components**: 1 admin page + cross-cutting guard/store

**Related Screens**:
- SCR039: AdminPageConfigPage

**Related User Stories**:
- US063: Toggle Page Visibility

**Related APIs/Routes**:
- (GET) `/api/v1/admin/page-config`
- (PATCH) `/api/v1/admin/page-config/:key`
- (GET) `/api/v1/config/pages`
- (GET, SSE) `/api/v1/config/stream`

**Related Data Models**:
- PageFeatureFlag

**Related Background Logic**:
- (none — request-time guard, not a scheduled job)

**Related Permissions**:
- PERM054: AdminPageConfigManagement
- PERM055: PageToggleEnforcement

---

### F016: WordFamily

**Type**: ui
**Description**: AI-assisted vocabulary study by root-word family. Students browse categories, generate new root-word groups via AI (with per-user/category dedup + concurrency lock), save families to a personal collection, and convert selected words into a `FlashCardSet` for spaced-repetition study. Admins manage categories via a dedicated admin CRUD screen.

**Workspace**: kmaedu-fe + kmaedu-be
**Languages**: TypeScript, Python (AI generation)
**Components**: 4 pages (3 student-facing + 1 admin)

**Related Screens**:
- SCR040: WordFamilyPage
- SCR041: WordFamilyCategoryPage
- SCR042: WordFamilyDetailPage
- SCR043: AdminWordFamilyPage

**Related User Stories**:
- US064: Browse Word Family Categories
- US065: Generate Word Family via AI
- US066: Save Word Family to Collection
- US067: Convert Word Family to Flashcard Deck

**Related APIs/Routes**:
- (GET) `/api/v1/word-family/categories`
- (GET) `/api/v1/word-family/categories/:slug/roots`
- (GET) `/api/v1/word-family/category/:categorySlug/:rootWord`
- (POST) `/api/v1/word-family/generate`
- (POST) `/api/v1/word-family/save`
- (GET) `/api/v1/word-family/saved`
- (DELETE) `/api/v1/word-family/saved/:wordFamilyId`
- (POST) `/api/v1/word-family/:id/to-flashcard`
- (GET/POST/PUT/DELETE) `/api/v1/admin/word-family/categories*`

**Related Data Models**:
- WordFamilyCategory
- WordFamily
- UserSavedWordFamily
- FlashCardSet, FlashCard, DetailsFlashCard (bridge target)

**Related Background Logic**:
- (none — AI generation is request-time, not scheduled)

**Related Permissions**:
- PERM056: WordFamilyAccess
- PERM057: AdminWordFamilyManagement

---

## Summary

- **Total Features**: 14 active + 2 removed (F005, F009)
- **Total Screens**: 41 (with 15 regions across 5 composite screens)
- **Total User Stories**: 66
- **Total Routes**: ~107
- **Total Data Models**: 23
- **Total Background Logic**: 5
- **Total Permissions**: 49
- **Languages Detected**: TypeScript, Python

## Cross-Reference Validation

- [x] All F### codes are unique (F001–F016)
- [x] All F### codes are referenced in UserStories.md
- [x] All screen references are valid (SCR### or SCR###/REG### in ScreenList; bare-SCR refs and region refs both accepted)
- [x] All user story references are valid (US### in UserStories)
- [x] All background logic references are valid (BL### in BehaviorLogic inventory)
- [x] All permission references are valid (PERM### in Permissions)
- [x] Every US has a parent feature (F###)
- [x] Every screen has a parent feature (F###)
- [x] Every region has a parent feature (F###)
- [x] Every background logic maps to a feature (F###)
- [x] Every permission maps to a feature (F###)
- [x] Composite screen shell SCRs (SCR013, SCR016, SCR018, SCR027; SCR025 removed 2026-06-14) have no bare-SCR refs from any feature — all region ownership is explicit via SCR###/REG###
- [x] Static pages (SCR002, SCR004–SCR007, SCR012) are covered by F001 without creating orphaned feature gaps