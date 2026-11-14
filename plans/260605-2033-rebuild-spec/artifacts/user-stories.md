# User Stories

**Project**: kmaedu
**Generated**: 2026-06-05
**Analysis Scope**: All 32 frontend screens + permissions matrix

**Code Format**: All US codes MUST follow `US###_NameSlug` format (e.g., US001_Login, US002_ViewDashboard)

**US Types**:
- `ui` - User-facing stories (require Screen mapping)
- `system` - System stories: hook, event, observer, bg-job, trigger, etc. (no Screen mapping needed)

**Note**: Feature mapping is managed in FeatureList.md only. This document contains user stories without direct feature references. UI US require Screen mapping; system/bg-job US do not. `ui`-typed stories may map to `SCR###` or `SCR###/REG###`; non-`ui` types map to `SCR###` only (or omit).

## Interaction Inventory

> Complete this table BEFORE writing any US. One row per interactive element per screen.
> Source of truth for US count — every row maps to ≥1 US below (unless merge exception applies).
> See: references/user-stories-ipe-protocol.md for enumeration rules and merge exception.

| Screen | Element | Type | Action | Endpoint |
|--------|---------|------|--------|---------|
| SCR001 | CTA Login button | navigation | Navigate to login page | N/A |
| SCR001 | CTA Register button | navigation | Navigate to register page | N/A |
| SCR001 | ContentGrid item | navigation | Browse/view public content | N/A |
| SCR003 | ContactForm | primary-action | Submit contact message | POST /api/v1/contact |
| SCR008 | SigninForm | primary-action | Sign in with email/password | POST /api/v1/auth/login |
| SCR008 | GoogleOneTap | navigation | Sign in with Google OAuth | GET /api/v1/auth/google |
| SCR009 | SignupForm | primary-action | Register new account | POST /api/v1/auth/register |
| SCR009 | TurnstileGuard | system-action | Bot protection challenge | N/A |
| SCR010 | ForgotPasswordForm | primary-action | Request password reset OTP | POST /api/v1/auth/send-code-reset-password |
| SCR011 | ResetPasswordForm | primary-action | Reset password with OTP | POST /api/v1/auth/reset-password |
| SCR013 | ProfileForm | primary-action | Update profile info | PUT /api/v1/profile |
| SCR013 | ChangePasswordSection | primary-action | Change account password | POST /api/v1/auth/change-password |
| SCR013 | DeviceList delete button | destructive-action | Terminate a session/device | DELETE /api/v1/devices/:deviceId |
| SCR014 | VerifyForm | primary-action | Verify account with OTP | POST /api/v1/auth/verifyAccount |
| SCR015 | SubscriptionTemplate | primary-action | Select plan and initiate payment | POST /api/v1/payment/subscription |
| SCR015 | QRPaymentDialog | system-action | Display SePay QR for payment | webhook (SePay callback) |
| SCR016/REG001 | QuizSetGrid create button | primary-action | Create new quiz set | POST /api/v1/quizsets |
| SCR016/REG001 | QuizSetGrid edit button (per row) | secondary-action | Edit quiz set | PUT /api/v1/quizsets/:id |
| SCR016/REG001 | QuizSetGrid delete button (per row) | destructive-action | Delete quiz set | DELETE /api/v1/quizsets/:id |
| SCR016/REG002 | FlashCardSetGrid create button | primary-action | Create new flashcard set | POST /api/v1/flashcardsets |
| SCR016/REG002 | FlashCardSetGrid edit button (per row) | secondary-action | Edit flashcard set | PUT /api/v1/flashcardsets/:id |
| SCR016/REG002 | FlashCardSetGrid delete button (per row) | destructive-action | Delete flashcard set | DELETE /api/v1/flashcardsets/:id |
| SCR016/REG003 | ExamRoomGrid create button | primary-action | Create new exam room | POST /api/v1/examrooms |
| SCR016/REG003 | ExamRoomGrid edit button (per row) | secondary-action | Edit exam room | PUT /api/v1/examrooms/:id |
| SCR016/REG003 | ExamRoomGrid delete button (per row) | destructive-action | Delete exam room | DELETE /api/v1/examrooms/:id |
| SCR017 | FlashcardSetGrid item | navigation | Browse flashcard sets | N/A |
| SCR017 | FlashcardGenerator | primary-action | Generate flashcards via AI | POST /api/v1/ai/job |
| SCR017 | FlashcardSetModal | primary-action | Create/edit flashcard set | POST/PUT /api/v1/flashcardsets |
| SCR018/REG001 | PDFHistoryList download button | secondary-action | Download processed PDF | GET /api/v1/student/recent-flashcards |
| SCR018/REG001 | PDFHistoryList delete button | destructive-action | Delete PDF history record | DELETE /api/v1/student/recent-flashcards |
| SCR018/REG002 | ExamHistoryList item | navigation | View exam attempt detail | N/A |
| SCR018/REG003 | StatsCards refresh | secondary-action | Refresh stats display | GET /api/v1/quizsets/stats |
| SCR019 | ExamHistoryListItem | navigation | View attempt details | N/A |
| SCR019 | Pagination | navigation | Navigate exam history pages | N/A |
| SCR020 | PDFHistoryListItem download | secondary-action | Download PDF file | GET /api/v1/student/recent-flashcards |
| SCR020 | PDFHistoryListItem delete | destructive-action | Delete PDF record | DELETE /api/v1/student/recent-flashcards |
| SCR020 | Pagination | navigation | Navigate PDF history pages | N/A |
| SCR021 | ExamRoomList create button | primary-action | Create exam room | POST /api/v1/examrooms |
| SCR021 | ExamRoomList edit button (per row) | secondary-action | Edit exam room | PUT /api/v1/examrooms/:id |
| SCR021 | ExamRoomList delete button (per row) | destructive-action | Delete exam room | DELETE /api/v1/examrooms/:id |
| SCR021 | QuizSetList create button | primary-action | Create quiz set | POST /api/v1/quizsets |
| SCR021 | QuizSetList edit button (per row) | secondary-action | Edit quiz set | PUT /api/v1/quizsets/:id |
| SCR021 | QuizSetList delete button (per row) | destructive-action | Delete quiz set | DELETE /api/v1/quizsets/:id |
| SCR022 | QuizSetHeader save-visibility | secondary-action | Save visibility setting | PUT /api/v1/quizsets/:id |
| SCR022 | LabelManager add label | primary-action | Add label to quiz set | POST /api/v1/quizsets/:id/labels |
| SCR022 | LabelManager edit label | secondary-action | Edit label | PUT /api/v1/quizsets/:id/labels/:labelId |
| SCR022 | LabelManager delete label | destructive-action | Delete label | DELETE /api/v1/quizsets/:id/labels/:labelId |
| SCR022 | QuestionList add question | primary-action | Add question to quiz set | POST /api/v1/quizsets/:id/questions |
| SCR022 | QuestionList edit question (per row) | secondary-action | Edit question | PUT /api/v1/quizsets/:id/questions/:questionId |
| SCR022 | QuestionList delete question (per row) | destructive-action | Delete question | DELETE /api/v1/quizsets/:id/questions/:questionId |
| SCR023 | FlashcardSetHeader save-visibility | secondary-action | Save visibility setting | PUT /api/v1/flashcardsets/:id |
| SCR023 | FlashcardLabelManager add label | primary-action | Add label to flashcard set | POST /api/v1/flashcardsets/:id/labels |
| SCR023 | FlashcardLabelManager edit label | secondary-action | Edit label | PUT /api/v1/flashcardsets/:id/labels/:labelId |
| SCR023 | FlashcardLabelManager delete label | destructive-action | Delete label | DELETE /api/v1/flashcardsets/:id/labels/:labelId |
| SCR023 | FlashcardList add flashcard | primary-action | Add flashcard to set | POST /api/v1/flashcardsets/:id/flashcards |
| SCR023 | FlashcardList edit flashcard (per row) | secondary-action | Edit flashcard | PUT /api/v1/flashcardsets/:id/flashcards/:flashcardId |
| SCR023 | FlashcardList delete flashcard (per row) | destructive-action | Delete flashcard | DELETE /api/v1/flashcardsets/:id/flashcards/:flashcardId |
| SCR024 | TestGenerator | primary-action | Generate quiz via AI | POST /api/v1/ai/job |
| SCR024 | FlashcardGenerator | primary-action | Generate flashcards via AI | POST /api/v1/ai/job |
| SCR024 | PendingJobDialog | secondary-action | View/cancel pending job | DELETE /api/v1/ai/job/:jobId |
| SCR025/REG001 | FolderPanel create folder | primary-action | Create knowledge folder | POST /api/v1/ai/tutor/knowledge-folders |
| SCR025/REG001 | FolderPanel edit folder | secondary-action | Edit knowledge folder | PUT /api/v1/ai/tutor/knowledge-folders/:id |
| SCR025/REG001 | FolderPanel delete folder | destructive-action | Delete knowledge folder | DELETE /api/v1/ai/tutor/knowledge-folders/:id |
| SCR025/REG002 | FilePanel upload file | primary-action | Upload knowledge file | POST /api/v1/ai/tutor/knowledge-files |
| SCR025/REG002 | FilePanel delete file | destructive-action | Delete knowledge file | DELETE /api/v1/ai/tutor/knowledge-files/:id |
| SCR025/REG002 | FilePanel reprocess file | secondary-action | Reprocess knowledge file | POST /api/v1/ai/tutor/knowledge-files/:id/reprocess |
| SCR025/REG003 | DatasetImportPanel start import | primary-action | Start dataset import job | POST /api/v1/ai/tutor/dataset-imports |
| SCR025/REG003 | DatasetImportPanel poll status | system-action | Poll import job status | GET /api/v1/ai/tutor/dataset-imports |
| SCR025/REG004 | StatsPanel refresh | secondary-action | Refresh knowledge stats | GET /api/v1/ai/tutor/knowledge-stats |
| SCR026 | ExamRoomList item | navigation | View exam room detail | N/A |
| SCR026 | ExamRoomForm save | primary-action | Create/edit exam room | POST/PUT /api/v1/examrooms |
| SCR027/REG001 | StatsGrid refresh | secondary-action | Refresh room statistics | GET /api/v1/examrooms/detail/:id |
| SCR027/REG002 | RoomInfoSection edit | secondary-action | Edit exam room metadata | PUT /api/v1/examrooms/:id |
| SCR027/REG003 | SessionTable create session | primary-action | Create exam session | POST /api/v1/examrooms/:id/sessions |
| SCR027/REG003 | SessionTable edit session (per row) | secondary-action | Edit exam session | PUT /api/v1/examsessions/:id |
| SCR027/REG003 | SessionTable delete session (per row) | destructive-action | Delete exam session | DELETE /api/v1/examsessions/:id |
| SCR027/REG004 | ShareDialog save | secondary-action | Save sharing/access settings | PUT /api/v1/examsessions/:id/sharing |
| SCR028 | AttemptTable sort | navigation | Sort attempt leaderboard | N/A |
| SCR028 | AttemptTable attempt row | navigation | View per-user attempt detail | N/A |
| SCR029 | SessionCard enter | navigation | Enter exam session | SCR031 |
| SCR029 | SessionCard view history | secondary-action | Open attempt history dialog | N/A |
| SCR029 | Pagination | navigation | Navigate exam session pages | N/A |
| SCR030 | FlipCard flip | navigation | Flip flashcard front/back | N/A |
| SCR030 | NavControls prev/next | navigation | Navigate to previous/next card | N/A |
| SCR030 | AccessModal enter code | primary-action | Enter access code to unlock study | N/A |
| SCR030 | TurnstileGuard | system-action | Bot protection on access check | N/A |
| SCR030 | ProgressAutoSave | system-action | Auto-save studied card progress | addStudiedCardApi |
| SCR031 | Start exam button | primary-action | Start new exam attempt | POST /api/v1/secure-quiz |
| SCR031 | Resume attempt button | primary-action | Resume in-progress attempt | POST /api/v1/secure-quiz |
| SCR031 | AccessCodeDialog enter code | primary-action | Enter session access code | GET /api/v1/examsessions/:id |
| SCR032 | QuizOptionRow select answer | navigation | Select answer option for question | N/A |
| SCR032 | CheatingWarningModal dismiss | navigation | Dismiss cheating warning | N/A |
| SCR032 | FullscreenConfirmDialog confirm | primary-action | Confirm fullscreen entry | N/A |
| SCR032 | ProgressAutoSave | system-action | Auto-save attempt progress every 30s | PUT /api/v1/examattempts/:attemptId/progress |
| SCR032 | Submit exam button | primary-action | Submit exam attempt | POST /api/v1/secure-submit |

---

## User Story Index

| Code | Title | Type | Priority | Screens |
|------|-------|------|----------|---------|
| US001 | Browse Platform Content | ui | high | SCR001 |
| US002 | Submit Contact Form | ui | low | SCR003 |
| US003 | Sign In with Email | ui | high | SCR008 |
| US004 | Sign In with Google OAuth | ui | high | SCR008 |
| US005 | Register Account | ui | high | SCR009 |
| US006 | Request Password Reset | ui | medium | SCR010 |
| US007 | Reset Password with OTP | ui | medium | SCR011 |
| US008 | Update Profile | ui | high | SCR013/REG001 |
| US009 | Change Account Password | ui | medium | SCR013 |
| US010 | Terminate Session | ui | medium | SCR013/REG002 |
| US011 | Verify Account | ui | high | SCR014 |
| US012 | Purchase Subscription | ui | high | SCR015 |
| US013 | Create Quiz Set | ui | high | SCR016/REG001, SCR021 |
| US014 | Edit Quiz Set | ui | high | SCR016/REG001, SCR022 |
| US015 | Delete Quiz Set | ui | medium | SCR016/REG001 |
| US016 | Create Flashcard Set | ui | high | SCR016/REG002, SCR017 |
| US017 | Edit Flashcard Set | ui | high | SCR016/REG002, SCR023 |
| US018 | Delete Flashcard Set | ui | medium | SCR016/REG002 |
| US019 | Create Exam Room | ui | high | SCR016/REG003, SCR021, SCR026 |
| US020 | Edit Exam Room | ui | high | SCR027/REG002 |
| US021 | Delete Exam Room | ui | medium | SCR021 |
| US022 | Browse Flashcard Sets | ui | medium | SCR017 |
| US023 | Generate Flashcards via AI | ui | high | SCR017, SCR024 |
| US024 | View PDF History | ui | medium | SCR018/REG001, SCR020 |
| US025 | Delete PDF History Record | ui | low | SCR018/REG001, SCR020 |
| US026 | View Exam History | ui | medium | SCR018/REG002, SCR019 |
| US027 | View Study Statistics | ui | low | SCR018/REG003 |
| US028 | Manage Quiz Set Labels | ui | medium | SCR022 |
| US029 | Add Question to Quiz Set | ui | high | SCR022 |
| US030 | Edit Question in Quiz Set | ui | high | SCR022 |
| US031 | Delete Question from Quiz Set | ui | medium | SCR022 |
| US032 | Manage Flashcard Set Labels | ui | medium | SCR023 |
| US033 | Add Flashcard to Set | ui | high | SCR023 |
| US034 | Edit Flashcard in Set | ui | high | SCR023 |
| US035 | Delete Flashcard from Set | ui | medium | SCR023 |
| US036 | Generate Quiz via AI | ui | high | SCR024 |
| US037 | Manage AI Generation Jobs | ui | medium | SCR024 |
| US038 | Manage Knowledge Folders | ui | medium | SCR025/REG001 |
| US039 | Upload Knowledge File | ui | medium | SCR025/REG002 |
| US040 | Reprocess Knowledge File | ui | low | SCR025/REG002 |
| US041 | Delete Knowledge File | ui | low | SCR025/REG002 |
| US042 | Import Dataset | ui | low | SCR025/REG003 |
| US043 | View Knowledge Statistics | ui | low | SCR025/REG004 |
| US044 | View Exam Room Detail | ui | medium | SCR026, SCR027 |
| US045 | Create Exam Session | ui | high | SCR027/REG003 |
| US046 | Edit Exam Session | ui | high | SCR027/REG003 |
| US047 | Delete Exam Session | ui | medium | SCR027/REG003 |
| US048 | Configure Session Sharing | ui | medium | SCR027/REG004 |
| US049 | View Session Analytics | ui | high | SCR028 |
| US050 | View Session Attempt Detail | ui | medium | SCR028 |
| US051 | Browse Exam Sessions | ui | high | SCR029 |
| US052 | View Attempt History | ui | medium | SCR029 |
| US053 | Access Flashcard Study | ui | high | SCR030 |
| US054 | Enter Flashcard Access Code | ui | medium | SCR030 |
| US055 | Study Flashcards | ui | high | SCR030 |
| US056 | Enter Exam Session | ui | high | SCR031 |
| US057 | Enter Session Access Code | ui | medium | SCR031 |
| US058 | Start Exam Attempt | ui | high | SCR031, SCR032 |
| US059 | Resume Exam Attempt | ui | high | SCR031, SCR032 |
| US060 | Answer Exam Question | ui | high | SCR032 |
| US061 | Submit Exam Attempt | ui | high | SCR032 |
| US062 | View Own Exam Results | ui | medium | SCR029, SCR032 |

---

## US001: Browse Platform Content

**Type**: ui
**Interaction**: navigation
**Priority**: high
**Estimate**: 1

### User Story

As a **guest**, I want to **browse** public quiz sets, flashcard sets, and exam rooms on the landing page so that I can discover content before deciding to register.

### Acceptance Criteria

- [ ] AC1: Landing page displays featured public quiz sets, flashcard sets, and exam rooms
- [ ] AC2: Guest can navigate to LoginPage via CTA
- [ ] AC3: Guest can navigate to RegisterPage via CTA
- [ ] AC4: Content is visible without authentication

### Technical Notes

- **Endpoint**: N/A (public GET routes)
- **Data Required**: Public QuizSet, FlashCardSet, ExamRoom listings
- **Dependencies**: PERM001

### Screens

- SCR001: HomePage

---

## US002: Submit Contact Form

**Type**: ui
**Interaction**: primary-action
**Priority**: low
**Estimate**: 1

### User Story

As a **guest**, I want to **submit** a contact message so that I can reach the platform team with questions or feedback.

### Acceptance Criteria

- [ ] AC1: Contact form accepts message content
- [ ] AC2: Form submission returns success confirmation
- [ ] AC3: Invalid input shows validation error

### Technical Notes

- **Endpoint**: POST /api/v1/contact
- **Data Required**: name, email, message
- **Dependencies**: PERM001

### Screens

- SCR003: ContactPage

---

## US003: Sign In with Email

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **guest**, I want to **sign in** with my email and password so that I can access my protected account.

### Acceptance Criteria

- [ ] AC1: SigninForm accepts email and password
- [ ] AC2: Valid credentials redirect to /k/my-materials
- [ ] AC3: Invalid credentials show error message
- [ ] AC4: Authenticated user is redirected away from login page

### Technical Notes

- **Endpoint**: POST /api/v1/auth/login
- **Data Required**: email, password
- **Dependencies**: PERM004

### Screens

- SCR008: LoginPage

---

## US004: Sign In with Google OAuth

**Type**: ui
**Interaction**: navigation
**Priority**: high
**Estimate**: 2

### User Story

As a **guest**, I want to **sign in** with my Google account so that I can access my account without creating a new password.

### Acceptance Criteria

- [ ] AC1: Google One Tap OAuth flow completes successfully
- [ ] AC2: Successful OAuth redirects to /k/my-materials
- [ ] AC3: Failed OAuth shows error and allows retry

### Technical Notes

- **Endpoint**: GET /api/v1/auth/google or POST /api/v1/auth/google/one-tap
- **Data Required**: Google ID token
- **Dependencies**: PERM004

### Screens

- SCR008: LoginPage

---

## US005: Register Account

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **guest**, I want to **register** a new account so that I can access the platform's learning features.

### Acceptance Criteria

- [ ] AC1: Registration form accepts required fields (email, password, username)
- [ ] AC2: Turnstile bot challenge is enforced before submission
- [ ] AC3: Successful registration sends verification email with OTP
- [ ] AC4: User is redirected to VerifyPage after registration
- [ ] AC5: Duplicate email shows validation error

### Technical Notes

- **Endpoint**: POST /api/v1/auth/register
- **Data Required**: email, password, username, turnstile token
- **Dependencies**: PERM005, PERM042

### Screens

- SCR009: RegisterPage

---

## US006: Request Password Reset

**Type**: ui
**Interaction**: primary-action
**Priority**: medium
**Estimate**: 1

### User Story

As a **guest**, I want to **request** a password reset code so that I can regain access to my account if I forgot my password.

### Acceptance Criteria

- [ ] AC1: Form accepts registered email address
- [ ] AC2: Valid email triggers OTP code sent to inbox
- [ ] AC3: User is redirected to ResetPasswordPage on success
- [ ] AC4: Unregistered email shows generic "not found" message (security)

### Technical Notes

- **Endpoint**: POST /api/v1/auth/send-code-reset-password
- **Data Required**: email
- **Dependencies**: PERM001

### Screens

- SCR010: ForgotPasswordPage

---

## US007: Reset Password with OTP

**Type**: ui
**Interaction**: primary-action
**Priority**: medium
**Estimate**: 1

### User Story

As a **guest**, I want to **reset** my password using an OTP code so that I can regain access to my account.

### Acceptance Criteria

- [ ] AC1: Form accepts 6-digit OTP and new password
- [ ] AC2: Valid OTP + new password updates credentials and redirects to login
- [ ] AC3: Invalid/expired OTP shows error
- [ ] AC4: Password meets minimum strength requirements

### Technical Notes

- **Endpoint**: POST /api/v1/auth/reset-password
- **Data Required**: email, otp code, new password
- **Dependencies**: PERM001

### Screens

- SCR011: ResetPasswordPage

---

## US008: Update Profile

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **student**, I want to **update** my profile information so that my identity is accurate on the platform.

### Acceptance Criteria

- [ ] AC1: ProfileForm allows editing name, username, bio, avatar, and banner
- [ ] AC2: Avatar and banner uploads go through R2 storage proxy
- [ ] AC3: Save action persists changes and shows success confirmation
- [ ] AC4: Validation errors shown inline for invalid input
- [ ] AC5: User can only edit their own profile

### Technical Notes

- **Endpoint**: PUT /api/v1/profile, POST /api/v1/r2/image
- **Data Required**: name, username, bio, avatar, banner
- **Dependencies**: PERM002, PERM003, PERM007

### Screens

- SCR013/REG001: ProfilePage / ProfileForm

---

## US009: Change Account Password

**Type**: ui
**Interaction**: primary-action
**Priority**: medium
**Estimate**: 1

### User Story

As a **student**, I want to **change** my account password so that I can maintain account security.

### Acceptance Criteria

- [ ] AC1: ChangePasswordSection requires current password + new password
- [ ] AC2: New password meets platform strength requirements
- [ ] AC3: Successful change sends email notification
- [ ] AC4: Incorrect current password shows error

### Technical Notes

- **Endpoint**: POST /api/v1/auth/change-password
- **Data Required**: currentPassword, newPassword
- **Dependencies**: PERM002, PERM003, PERM010

### Screens

- SCR013: ProfilePage / ChangePasswordSection

---

## US010: Terminate Session

**Type**: ui
**Interaction**: destructive-action
**Priority**: medium
**Estimate**: 1

### User Story

As a **student**, I want to **terminate** a session or device so that I can log out of a specific device without affecting my current session.

### Acceptance Criteria

- [ ] AC1: DeviceList displays all active sessions with device/browser/OS/IP info
- [ ] AC2: Delete button on a non-current session terminates that session
- [ ] AC3: Current session cannot be terminated from the list
- [ ] AC4: Terminated session receives 401 on next request

### Technical Notes

- **Endpoint**: DELETE /api/v1/devices/:deviceId
- **Data Required**: deviceId
- **Dependencies**: PERM002, PERM003, PERM008, PERM009

### Screens

- SCR013/REG002: ProfilePage / DeviceList

---

## US011: Verify Account

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 1

### User Story

As a **student**, I want to **verify** my account with an OTP code so that I can unlock access to protected platform features.

### Acceptance Criteria

- [ ] AC1: VerifyForm accepts 6-digit OTP
- [ ] AC2: Valid OTP activates account and redirects to /k/my-materials
- [ ] AC3: Invalid OTP shows error with retry option
- [ ] AC4: Unverified accounts are redirected to /k/verify on any protected route

### Technical Notes

- **Endpoint**: POST /api/v1/auth/verifyAccount
- **Data Required**: otp code
- **Dependencies**: PERM002, PERM003

### Screens

- SCR014: VerifyPage

---

## US012: Purchase Subscription

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 3

### User Story

As a **student**, I want to **purchase** a subscription plan so that I can access premium features and AI generation credits.

### Acceptance Criteria

- [ ] AC1: SubscriptionPage displays available plans with pricing
- [ ] AC2: Plan selection initiates SePay virtual account creation
- [ ] AC3: QR code is displayed for bank transfer payment
- [ ] AC4: Payment webhook marks subscription as paid on successful transfer
- [ ] AC5: User is redirected to ProfilePage after activation

### Technical Notes

- **Endpoint**: POST /api/v1/payment/subscription, webhook (SePay callback)
- **Data Required**: planId, payment method
- **Dependencies**: PERM002, PERM003, PERM012, PERM013

### Screens

- SCR015: SubscriptionPage

---

## US013: Create Quiz Set

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **teacher**, I want to **create** a quiz set so that I can author questions for students to practice.

### Acceptance Criteria

- [ ] AC1: Create quiz set modal accepts title, description, and visibility
- [ ] AC2: New quiz set is created and user is redirected to detail page
- [ ] AC3: Creating user becomes the owner with full edit/delete permissions
- [ ] AC4: Visibility can be set to public or private

### Technical Notes

- **Endpoint**: POST /api/v1/quizsets
- **Data Required**: title, description, visibility
- **Dependencies**: PERM002, PERM003, PERM014, PERM043

### Screens

- SCR016/REG001: MyMaterialsPage / QuizSetGrid
- SCR021: ManageExamPage

---

## US014: Edit Quiz Set

**Type**: ui
**Interaction**: secondary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **teacher**, I want to **edit** my quiz set metadata, labels, and questions so that I can keep my content accurate and up to date.

### Acceptance Criteria

- [ ] AC1: QuizSetHeader allows editing title, description, and visibility
- [ ] AC2: LabelManager allows adding, editing, and deleting labels
- [ ] AC3: QuestionList allows adding, editing, and deleting questions
- [ ] AC4: Non-owners receive 403 when attempting to edit
- [ ] AC5: Changes are saved and reflected immediately

### Technical Notes

- **Endpoint**: PUT /api/v1/quizsets/:id, POST/PUT/DELETE /api/v1/quizsets/:id/labels, POST/PUT/DELETE /api/v1/quizsets/:id/questions
- **Data Required**: title, description, visibility, labels, questions
- **Dependencies**: PERM002, PERM003, PERM015, PERM043

### Screens

- SCR016/REG001: MyMaterialsPage / QuizSetGrid
- SCR022: ManageQuizSetDetailPage

---

## US015: Delete Quiz Set

**Type**: ui
**Interaction**: destructive-action
**Priority**: medium
**Estimate**: 1

### User Story

As a **teacher**, I want to **delete** my quiz set so that I can remove outdated or unwanted content.

### Acceptance Criteria

- [ ] AC1: Delete button triggers confirmation dialog
- [ ] AC2: Confirmed deletion removes quiz set and all associated questions and labels
- [ ] AC3: Non-owners receive 403
- [ ] AC4: Deleted quiz set is no longer visible in grid

### Technical Notes

- **Endpoint**: DELETE /api/v1/quizsets/:id
- **Data Required**: quizSetId
- **Dependencies**: PERM002, PERM003, PERM016

### Screens

- SCR016/REG001: MyMaterialsPage / QuizSetGrid

---

## US016: Create Flashcard Set

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **teacher**, I want to **create** a flashcard set so that I can author cards for students to study.

### Acceptance Criteria

- [ ] AC1: Create flashcard set modal accepts title, description, and visibility
- [ ] AC2: New flashcard set is created and user is redirected to detail page
- [ ] AC3: Creating user becomes the owner
- [ ] AC4: Visibility can be set to public or private

### Technical Notes

- **Endpoint**: POST /api/v1/flashcardsets
- **Data Required**: title, description, visibility
- **Dependencies**: PERM002, PERM003, PERM017, PERM044

### Screens

- SCR016/REG002: MyMaterialsPage / FlashCardSetGrid
- SCR017: FlashcardsPage

---

## US017: Edit Flashcard Set

**Type**: ui
**Interaction**: secondary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **teacher**, I want to **edit** my flashcard set metadata, labels, and cards so that I can keep my content accurate.

### Acceptance Criteria

- [ ] AC1: FlashcardSetHeader allows editing title, description, and visibility
- [ ] AC2: FlashcardLabelManager allows adding, editing, and deleting labels
- [ ] AC3: FlashcardList allows adding, editing, and deleting flashcards
- [ ] AC4: Non-owners receive 403
- [ ] AC5: Changes are saved and reflected immediately

### Technical Notes

- **Endpoint**: PUT /api/v1/flashcardsets/:id, POST/PUT/DELETE /api/v1/flashcardsets/:id/labels, POST/PUT/DELETE /api/v1/flashcardsets/:id/flashcards
- **Data Required**: title, description, visibility, labels, flashcards
- **Dependencies**: PERM002, PERM003, PERM018, PERM044

### Screens

- SCR016/REG002: MyMaterialsPage / FlashCardSetGrid
- SCR023: ManageFlashcardSetDetailPage

---

## US018: Delete Flashcard Set

**Type**: ui
**Interaction**: destructive-action
**Priority**: medium
**Estimate**: 1

### User Story

As a **teacher**, I want to **delete** my flashcard set so that I can remove outdated or unwanted content.

### Acceptance Criteria

- [ ] AC1: Delete button triggers confirmation dialog
- [ ] AC2: Confirmed deletion removes flashcard set and all associated cards
- [ ] AC3: Non-owners receive 403
- [ ] AC4: Deleted set is no longer visible in grid

### Technical Notes

- **Endpoint**: DELETE /api/v1/flashcardsets/:id
- **Data Required**: flashcardSetId
- **Dependencies**: PERM002, PERM003, PERM019

### Screens

- SCR016/REG002: MyMaterialsPage / FlashCardSetGrid

---

## US019: Create Exam Room

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **teacher**, I want to **create** an exam room so that I can host exams for students.

### Acceptance Criteria

- [ ] AC1: Create exam room form/modal accepts room metadata
- [ ] AC2: New exam room is created and user is redirected to detail page
- [ ] AC3: Creating user becomes the host with full permissions
- [ ] AC4: Room can be configured with access control (public/whitelist/code)

### Technical Notes

- **Endpoint**: POST /api/v1/examrooms
- **Data Required**: title, description, accessControl, quizSetId
- **Dependencies**: PERM002, PERM003, PERM020, PERM045

### Screens

- SCR016/REG003: MyMaterialsPage / ExamRoomGrid
- SCR021: ManageExamPage
- SCR026: ManageExamRoomPage

---

## US020: Edit Exam Room

**Type**: ui
**Interaction**: secondary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **teacher**, I want to **edit** my exam room metadata so that I can update room settings and configurations.

### Acceptance Criteria

- [ ] AC1: RoomInfoSection allows editing room title, description, and settings
- [ ] AC2: Only the host can edit room metadata
- [ ] AC3: Non-hosts receive 403
- [ ] AC4: Changes are saved and reflected immediately

### Technical Notes

- **Endpoint**: PUT /api/v1/examrooms/:id
- **Data Required**: title, description, accessControl
- **Dependencies**: PERM002, PERM003, PERM021, PERM045

### Screens

- SCR027/REG002: ManageExamRoomDetailPage / RoomInfoSection

---

## US021: Delete Exam Room

**Type**: ui
**Interaction**: destructive-action
**Priority**: medium
**Estimate**: 1

### User Story

As a **teacher**, I want to **delete** my exam room so that I can remove outdated or unwanted exam hosting spaces.

### Acceptance Criteria

- [ ] AC1: Delete button triggers confirmation dialog
- [ ] AC2: Confirmed deletion cascades to all associated sessions
- [ ] AC3: Non-hosts receive 403
- [ ] AC4: Deleted room is no longer visible in lists

### Technical Notes

- **Endpoint**: DELETE /api/v1/examrooms/:id
- **Data Required**: examRoomId
- **Dependencies**: PERM002, PERM003, PERM022

### Screens

- SCR021: ManageExamPage

---

## US022: Browse Flashcard Sets

**Type**: ui
**Interaction**: navigation
**Priority**: medium
**Estimate**: 1

### User Story

As a **student**, I want to **browse** flashcard sets so that I can discover study materials created by other users.

### Acceptance Criteria

- [ ] AC1: FlashcardsPage displays public flashcard sets in a grid
- [ ] AC2: Clicking a set navigates to the study interface or detail page
- [ ] AC3: Private sets are only visible to their owners

### Technical Notes

- **Endpoint**: GET /api/v1/flashcardsets
- **Data Required**: FlashCardSet listings
- **Dependencies**: PERM002, PERM003, PERM044

### Screens

- SCR017: FlashcardsPage

---

## US023: Generate Flashcards via AI

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 3

### User Story

As a **student**, I want to **generate** flashcards from my uploaded documents using AI so that I can quickly create study materials.

### Acceptance Criteria

- [ ] AC1: FlashcardGenerator accepts a source document and generation parameters
- [ ] AC2: Credit balance is checked before generation starts (or FREE_MODE bypass)
- [ ] AC3: Generation job is created and status is pollable
- [ ] AC4: Generated flashcards are associated with the source document
- [ ] AC5: Insufficient credits show error with link to subscription page

### Technical Notes

- **Endpoint**: POST /api/v1/ai/job
- **Data Required**: sourceFileId, generationType, parameters
- **Dependencies**: PERM002, PERM003, PERM035, PERM036, PERM041

### Screens

- SCR017: FlashcardsPage
- SCR024: AIToolPage

---

## US024: View PDF History

**Type**: ui
**Interaction**: secondary-action
**Priority**: medium
**Estimate**: 1

### User Story

As a **student**, I want to **view** my PDF upload history so that I can track which documents have been processed and access generated content.

### Acceptance Criteria

- [ ] AC1: PDF history list shows uploaded files with processing status
- [ ] AC2: Each item displays file name, upload date, and processing status
- [ ] AC3: Download action retrieves the processed PDF
- [ ] AC4: History is scoped to the authenticated user only

### Technical Notes

- **Endpoint**: GET /api/v1/student/recent-flashcards
- **Data Required**: UserStorage, processingStatus
- **Dependencies**: PERM002, PERM003, PERM038

### Screens

- SCR018/REG001: HistoryPage / PDFHistoryList
- SCR020: PDFHistoryPage

---

## US025: Delete PDF History Record

**Type**: ui
**Interaction**: destructive-action
**Priority**: low
**Estimate**: 1

### User Story

As a **student**, I want to **delete** a PDF history record so that I can remove unwanted entries from my history.

### Acceptance Criteria

- [ ] AC1: Delete button triggers confirmation dialog
- [ ] AC2: Confirmed deletion removes the record from history
- [ ] AC3: User can only delete their own records

### Technical Notes

- **Endpoint**: DELETE /api/v1/student/recent-flashcards
- **Data Required**: recordId
- **Dependencies**: PERM002, PERM003, PERM038

### Screens

- SCR018/REG001: HistoryPage / PDFHistoryList
- SCR020: PDFHistoryPage

---

## US026: View Exam History

**Type**: ui
**Interaction**: navigation
**Priority**: medium
**Estimate**: 1

### User Story

As a **student**, I want to **view** my exam attempt history so that I can review my past performance and scores.

### Acceptance Criteria

- [ ] AC1: Exam history list shows past attempts with scores, timestamps, and pass/fail status
- [ ] AC2: Clicking an attempt navigates to the result detail view
- [ ] AC3: Pagination is available for large histories
- [ ] AC4: History is scoped to the authenticated user only

### Technical Notes

- **Endpoint**: GET /api/v1/student/recent-exams
- **Data Required**: ExamAttempt listings
- **Dependencies**: PERM002, PERM003, PERM039

### Screens

- SCR018/REG002: HistoryPage / ExamHistoryList
- SCR019: ExamHistoryPage

---

## US027: View Study Statistics

**Type**: ui
**Interaction**: secondary-action
**Priority**: low
**Estimate**: 1

### User Story

As a **student**, I want to **view** my study statistics so that I can track my learning progress over time.

### Acceptance Criteria

- [ ] AC1: StatsCards display aggregated stats: total PDFs, exams taken, study hours
- [ ] AC2: Refresh button reloads stats from the server
- [ ] AC3: Stats are cached for 5 minutes to reduce server load

### Technical Notes

- **Endpoint**: GET /api/v1/quizsets/stats
- **Data Required**: HistoryStats
- **Dependencies**: PERM002, PERM003

### Screens

- SCR018/REG003: HistoryPage / StatsCards

---

## US028: Manage Quiz Set Labels

**Type**: ui
**Interaction**: primary-action
**Priority**: medium
**Estimate**: 2

### User Story

As a **teacher**, I want to **manage** labels (chapters/sections) within my quiz set so that I can organize questions by topic.

### Acceptance Criteria

- [ ] AC1: LabelManager allows adding a new label with name
- [ ] AC2: Existing labels can be edited inline
- [ ] AC3: Labels can be deleted (with confirmation if questions are tagged)
- [ ] AC4: Non-owners receive 403

### Technical Notes

- **Endpoint**: POST /api/v1/quizsets/:id/labels, PUT /api/v1/quizsets/:id/labels/:labelId, DELETE /api/v1/quizsets/:id/labels/:labelId
- **Data Required**: label name, labelId
- **Dependencies**: PERM002, PERM003, PERM015

### Screens

- SCR022: ManageQuizSetDetailPage / LabelManager

---

## US029: Add Question to Quiz Set

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **teacher**, I want to **add** a question to my quiz set so that I can build a comprehensive practice quiz.

### Acceptance Criteria

- [ ] AC1: QuestionEditorDialog accepts question text, options, and correct answer
- [ ] AC2: New question appears in the QuestionList after saving
- [ ] AC3: Non-owners receive 403
- [ ] AC4: Validation requires at least 2 options and a correct answer

### Technical Notes

- **Endpoint**: POST /api/v1/quizsets/:id/questions
- **Data Required**: questionText, options, correctAnswer
- **Dependencies**: PERM002, PERM003, PERM015

### Screens

- SCR022: ManageQuizSetDetailPage / QuestionList

---

## US030: Edit Question in Quiz Set

**Type**: ui
**Interaction**: secondary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **teacher**, I want to **edit** a question in my quiz set so that I can correct mistakes or update content.

### Acceptance Criteria

- [ ] AC1: QuestionEditorDialog pre-fills with existing question data
- [ ] AC2: Edited question is updated in the QuestionList after saving
- [ ] AC3: Non-owners receive 403
- [ ] AC4: Validation errors shown inline

### Technical Notes

- **Endpoint**: PUT /api/v1/quizsets/:id/questions/:questionId
- **Data Required**: questionText, options, correctAnswer
- **Dependencies**: PERM002, PERM003, PERM015

### Screens

- SCR022: ManageQuizSetDetailPage / QuestionList

---

## US031: Delete Question from Quiz Set

**Type**: ui
**Interaction**: destructive-action
**Priority**: medium
**Estimate**: 1

### User Story

As a **teacher**, I want to **delete** a question from my quiz set so that I can remove incorrect or outdated questions.

### Acceptance Criteria

- [ ] AC1: Delete button triggers confirmation dialog
- [ ] AC2: Confirmed deletion removes the question from the set
- [ ] AC3: Non-owners receive 403

### Technical Notes

- **Endpoint**: DELETE /api/v1/quizsets/:id/questions/:questionId
- **Data Required**: questionId
- **Dependencies**: PERM002, PERM003, PERM015

### Screens

- SCR022: ManageQuizSetDetailPage / QuestionList

---

## US032: Manage Flashcard Set Labels

**Type**: ui
**Interaction**: primary-action
**Priority**: medium
**Estimate**: 2

### User Story

As a **teacher**, I want to **manage** labels within my flashcard set so that I can organize cards by topic.

### Acceptance Criteria

- [ ] AC1: FlashcardLabelManager allows adding, editing, and deleting labels
- [ ] AC2: Non-owners receive 403
- [ ] AC3: Label changes are saved immediately

### Technical Notes

- **Endpoint**: POST/PUT/DELETE /api/v1/flashcardsets/:id/labels
- **Data Required**: label name, labelId
- **Dependencies**: PERM002, PERM003, PERM018

### Screens

- SCR023: ManageFlashcardSetDetailPage / FlashcardLabelManager

---

## US033: Add Flashcard to Set

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **teacher**, I want to **add** a flashcard to my set so that I can build a comprehensive study deck.

### Acceptance Criteria

- [ ] AC1: FlashcardEditorDialog accepts front (question) and back (answer) content
- [ ] AC2: New flashcard appears in the FlashcardList after saving
- [ ] AC3: Non-owners receive 403

### Technical Notes

- **Endpoint**: POST /api/v1/flashcardsets/:id/flashcards
- **Data Required**: front, back
- **Dependencies**: PERM002, PERM003, PERM018

### Screens

- SCR023: ManageFlashcardSetDetailPage / FlashcardList

---

## US034: Edit Flashcard in Set

**Type**: ui
**Interaction**: secondary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **teacher**, I want to **edit** a flashcard in my set so that I can correct mistakes or update content.

### Acceptance Criteria

- [ ] AC1: FlashcardEditorDialog pre-fills with existing card data
- [ ] AC2: Edited card is updated in the FlashcardList after saving
- [ ] AC3: Non-owners receive 403

### Technical Notes

- **Endpoint**: PUT /api/v1/flashcardsets/:id/flashcards/:flashcardId
- **Data Required**: front, back
- **Dependencies**: PERM002, PERM003, PERM018

### Screens

- SCR023: ManageFlashcardSetDetailPage / FlashcardList

---

## US035: Delete Flashcard from Set

**Type**: ui
**Interaction**: destructive-action
**Priority**: medium
**Estimate**: 1

### User Story

As a **teacher**, I want to **delete** a flashcard from my set so that I can remove incorrect or unwanted cards.

### Acceptance Criteria

- [ ] AC1: Delete button triggers confirmation dialog
- [ ] AC2: Confirmed deletion removes the flashcard from the set
- [ ] AC3: Non-owners receive 403

### Technical Notes

- **Endpoint**: DELETE /api/v1/flashcardsets/:id/flashcards/:flashcardId
- **Data Required**: flashcardId
- **Dependencies**: PERM002, PERM003, PERM018

### Screens

- SCR023: ManageFlashcardSetDetailPage / FlashcardList

---

## US036: Generate Quiz via AI

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 3

### User Story

As a **student**, I want to **generate** a quiz from my uploaded documents using AI so that I can quickly create practice tests.

### Acceptance Criteria

- [ ] AC1: TestGenerator accepts a source document and quiz parameters
- [ ] AC2: Credit balance is checked before generation (or FREE_MODE bypass)
- [ ] AC3: Generation job is created and status is pollable
- [ ] AC4: Generated quiz is associated with the source document
- [ ] AC5: Insufficient credits show error with link to subscription page

### Technical Notes

- **Endpoint**: POST /api/v1/ai/job
- **Data Required**: sourceFileId, generationType, parameters
- **Dependencies**: PERM002, PERM003, PERM035, PERM036, PERM041

### Screens

- SCR024: AIToolPage

---

## US037: Manage AI Generation Jobs

**Type**: ui
**Interaction**: secondary-action
**Priority**: medium
**Estimate**: 2

### User Story

As a **student**, I want to **manage** my AI generation jobs so that I can monitor progress and cancel unwanted jobs.

### Acceptance Criteria

- [ ] AC1: Job list displays all generation jobs with status (pending, processing, done, failed)
- [ ] AC2: PendingJobDialog shows detailed job status and progress
- [ ] AC3: Cancel/delete action terminates a pending or failed job
- [ ] AC4: Completed jobs show generated content count

### Technical Notes

- **Endpoint**: GET /api/v1/ai/job/:jobId, DELETE /api/v1/ai/job/:jobId
- **Data Required**: jobId, jobStatus
- **Dependencies**: PERM002, PERM003, PERM035

### Screens

- SCR024: AIToolPage / PendingJobDialog

---

## US038: Manage Knowledge Folders

**Type**: ui
**Interaction**: primary-action
**Priority**: medium
**Estimate**: 2

### User Story

As a **student**, I want to **manage** knowledge folders so that I can organize my uploaded files for the AI tutor.

### Acceptance Criteria

- [ ] AC1: FolderPanel allows creating a new folder with a name
- [ ] AC2: Existing folders can be renamed
- [ ] AC3: Folders can be deleted (cascades to contained files)
- [ ] AC4: Folders are listed with file counts

### Technical Notes

- **Endpoint**: POST /api/v1/ai/tutor/knowledge-folders, PUT /api/v1/ai/tutor/knowledge-folders/:id, DELETE /api/v1/ai/tutor/knowledge-folders/:id
- **Data Required**: folder name, folderId
- **Dependencies**: PERM002, PERM003, PERM037

### Screens

- SCR025/REG001: GenAIKnowledgePage / FolderPanel

---

## US039: Upload Knowledge File

**Type**: ui
**Interaction**: primary-action
**Priority**: medium
**Estimate**: 2

### User Story

As a **student**, I want to **upload** a knowledge file so that I can build my AI tutor's understanding of specific topics.

### Acceptance Criteria

- [ ] AC1: FilePanel accepts file upload (PDF, DOC, etc.)
- [ ] AC2: Uploaded file is processed by AI service to produce chunks and embeddings
- [ ] AC3: File appears in list with processing status indicator
- [ ] AC4: File can be assigned to a knowledge folder

### Technical Notes

- **Endpoint**: POST /api/v1/ai/tutor/knowledge-files
- **Data Required**: file, folderId (optional)
- **Dependencies**: PERM002, PERM003, PERM037

### Screens

- SCR025/REG002: GenAIKnowledgePage / FilePanel

---

## US040: Reprocess Knowledge File

**Type**: ui
**Interaction**: secondary-action
**Priority**: low
**Estimate**: 2

### User Story

As a **student**, I want to **reprocess** a knowledge file so that I can regenerate embeddings after updating my source material.

### Acceptance Criteria

- [ ] AC1: Reprocess action triggers a new AI processing job for the file
- [ ] AC2: File status changes to "processing" during reprocessing
- [ ] AC3: Original embeddings are replaced upon completion

### Technical Notes

- **Endpoint**: POST /api/v1/ai/tutor/knowledge-files/:id/reprocess
- **Data Required**: fileId
- **Dependencies**: PERM002, PERM003, PERM037

### Screens

- SCR025/REG002: GenAIKnowledgePage / FilePanel

---

## US041: Delete Knowledge File

**Type**: ui
**Interaction**: destructive-action
**Priority**: low
**Estimate**: 1

### User Story

As a **student**, I want to **delete** a knowledge file so that I can remove outdated or unwanted files from my knowledge base.

### Acceptance Criteria

- [ ] AC1: Delete button triggers confirmation dialog
- [ ] AC2: Confirmed deletion removes the file and its associated chunks and embeddings
- [ ] AC3: File is removed from all AI chat sessions that referenced it

### Technical Notes

- **Endpoint**: DELETE /api/v1/ai/tutor/knowledge-files/:id
- **Data Required**: fileId
- **Dependencies**: PERM002, PERM003, PERM037

### Screens

- SCR025/REG002: GenAIKnowledgePage / FilePanel

---

## US042: Import Dataset

**Type**: ui
**Interaction**: primary-action
**Priority**: low
**Estimate**: 2

### User Story

As a **student**, I want to **import** a dataset so that I can bulk-load content into my knowledge base for the AI tutor.

### Acceptance Criteria

- [ ] AC1: DatasetImportPanel accepts a dataset file for import
- [ ] AC2: Import job is created and status is pollable
- [ ] AC3: Progress is shown during import
- [ ] AC4: Completed import adds content to knowledge base

### Technical Notes

- **Endpoint**: POST /api/v1/ai/tutor/dataset-imports, GET /api/v1/ai/tutor/dataset-imports
- **Data Required**: dataset file, import parameters
- **Dependencies**: PERM002, PERM003, PERM037

### Screens

- SCR025/REG003: GenAIKnowledgePage / DatasetImportPanel

---

## US043: View Knowledge Statistics

**Type**: ui
**Interaction**: secondary-action
**Priority**: low
**Estimate**: 1

### User Story

As a **student**, I want to **view** knowledge base statistics so that I can understand the scope of my AI tutor's training data.

### Acceptance Criteria

- [ ] AC1: StatsPanel displays total files, chunks, and graph nodes
- [ ] AC2: Refresh button reloads stats from the server
- [ ] AC3: Stats are scoped to the authenticated user

### Technical Notes

- **Endpoint**: GET /api/v1/ai/tutor/knowledge-stats
- **Data Required**: file count, chunk count, graph node count
- **Dependencies**: PERM002, PERM003, PERM037

### Screens

- SCR025/REG004: GenAIKnowledgePage / StatsPanel

---

## US044: View Exam Room Detail

**Type**: ui
**Interaction**: navigation
**Priority**: medium
**Estimate**: 1

### User Story

As a **teacher**, I want to **view** my exam room detail so that I can monitor room status, stats, and manage sessions.

### Acceptance Criteria

- [ ] AC1: Exam room detail page displays room metadata, stats, and session list
- [ ] AC2: StatsGrid shows total sessions, participants, and attempt counts
- [ ] AC3: SessionTable is paginated and shows session status
- [ ] AC4: Non-hosts receive 403

### Technical Notes

- **Endpoint**: GET /api/v1/examrooms/detail/:id, GET /api/v1/examsessions/list
- **Data Required**: ExamRoom, ExamSession listings
- **Dependencies**: PERM002, PERM003, PERM021

### Screens

- SCR026: ManageExamRoomPage
- SCR027: ManageExamRoomDetailPage

---

## US045: Create Exam Session

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **teacher**, I want to **create** an exam session so that I can schedule a specific time window for students to attempt my exam.

### Acceptance Criteria

- [ ] AC1: ExamSessionFormModal accepts session title, start/end time, time limit, and max attempts
- [ ] AC2: New session appears in the SessionTable after saving
- [ ] AC3: Only the room host can create sessions
- [ ] AC4: Non-hosts receive 403

### Technical Notes

- **Endpoint**: POST /api/v1/examrooms/:id/sessions
- **Data Required**: title, startTime, endTime, timeLimit, maxAttempts
- **Dependencies**: PERM002, PERM003, PERM023

### Screens

- SCR027/REG003: ManageExamRoomDetailPage / SessionTable

---

## US046: Edit Exam Session

**Type**: ui
**Interaction**: secondary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **teacher**, I want to **edit** my exam session so that I can adjust timing, attempt limits, or other settings.

### Acceptance Criteria

- [ ] AC1: Session edit pre-fills existing session data in the form modal
- [ ] AC2: Edited session is updated in the SessionTable after saving
- [ ] AC3: Only the room host can edit sessions
- [ ] AC4: Non-hosts receive 403

### Technical Notes

- **Endpoint**: PUT /api/v1/examsessions/:id
- **Data Required**: title, startTime, endTime, timeLimit, maxAttempts
- **Dependencies**: PERM002, PERM003, PERM024

### Screens

- SCR027/REG003: ManageExamRoomDetailPage / SessionTable

---

## US047: Delete Exam Session

**Type**: ui
**Interaction**: destructive-action
**Priority**: medium
**Estimate**: 1

### User Story

As a **teacher**, I want to **delete** my exam session so that I can remove unwanted or cancelled exam sessions.

### Acceptance Criteria

- [ ] AC1: Delete button triggers DeleteConfirmDialog
- [ ] AC2: Confirmed deletion removes the session
- [ ] AC3: Only the room host can delete sessions
- [ ] AC4: Non-hosts receive 403

### Technical Notes

- **Endpoint**: DELETE /api/v1/examsessions/:id
- **Data Required**: sessionId
- **Dependencies**: PERM002, PERM003, PERM024

### Screens

- SCR027/REG003: ManageExamRoomDetailPage / SessionTable

---

## US048: Configure Session Sharing

**Type**: ui
**Interaction**: secondary-action
**Priority**: medium
**Estimate**: 1

### User Story

As a **teacher**, I want to **configure** sharing settings for my exam session so that I can control who can access and attempt the exam.

### Acceptance Criteria

- [ ] AC1: ShareDialog allows setting access mode: public, whitelist, or access code
- [ ] AC2: Access code can be generated or manually set
- [ ] AC3: Shareable link can be copied
- [ ] AC4: Only the session host can modify sharing settings

### Technical Notes

- **Endpoint**: GET /api/v1/examsessions/:id/sharing, PUT /api/v1/examsessions/:id/sharing
- **Data Required**: accessMode, accessCode, whitelist
- **Dependencies**: PERM002, PERM003, PERM025, PERM045

### Screens

- SCR027/REG004: ManageExamRoomDetailPage / ShareDialog

---

## US049: View Session Analytics

**Type**: ui
**Interaction**: navigation
**Priority**: high
**Estimate**: 2

### User Story

As a **teacher**, I want to **view** analytics for my exam session so that I can evaluate student performance and detect cheating behavior.

### Acceptance Criteria

- [ ] AC1: ScoreBarChart displays score distribution across all attempts
- [ ] AC2: ViolationPieChart shows breakdown of cheating violation types
- [ ] AC3: AttemptTable shows student leaderboard sorted by score
- [ ] AC4: Only the session host can view analytics
- [ ] AC5: Non-hosts receive 403

### Technical Notes

- **Endpoint**: GET /api/v1/examrooms/:id/sessions/:sessionId/attempts
- **Data Required**: ExamAttempt, CheatingLog, ExamSession
- **Dependencies**: PERM002, PERM003, PERM026

### Screens

- SCR028: ExamRoomSessionAnalyticsPage

---

## US050: View Session Attempt Detail

**Type**: ui
**Interaction**: navigation
**Priority**: medium
**Estimate**: 1

### User Story

As a **teacher**, I want to **view** details of a specific student attempt so that I can review individual performance and violations.

### Acceptance Criteria

- [ ] AC1: AttemptDetailSheet shows per-user attempt history and violation log
- [ ] AC2: Attempt is scoped to the session host only
- [ ] AC3: Non-hosts receive 403

### Technical Notes

- **Endpoint**: GET /api/v1/examrooms/:id/sessions/:sessionId/attempts/:attemptId
- **Data Required**: ExamAttempt, CheatingLog
- **Dependencies**: PERM002, PERM003, PERM026

### Screens

- SCR028: ExamRoomSessionAnalyticsPage / AttemptTable

---

## US051: Browse Exam Sessions

**Type**: ui
**Interaction**: navigation
**Priority**: high
**Estimate**: 2

### User Story

As a **student**, I want to **browse** available exam sessions so that I can find exams to attempt.

### Acceptance Criteria

- [ ] AC1: MyExamsPage displays exam sessions the student has access to
- [ ] AC2: SessionCard shows session title, attempt count, best score, and status (in-progress/completed)
- [ ] AC3: Clicking a session card navigates to the session entry page
- [ ] AC4: Pagination is available for large session lists

### Technical Notes

- **Endpoint**: GET /api/v1/examrooms/list or student sessions endpoint
- **Data Required**: ExamSession, ExamAttempt (grouped)
- **Dependencies**: PERM002, PERM003, PERM027

### Screens

- SCR029: MyExamsPage

---

## US052: View Attempt History

**Type**: ui
**Interaction**: secondary-action
**Priority**: medium
**Estimate**: 1

### User Story

As a **student**, I want to **view** my attempt history for a specific session so that I can review my past performance.

### Acceptance Criteria

- [ ] AC1: SessionHistoryDialog lists all attempts for the selected session
- [ ] AC2: Each attempt shows score, timestamp, duration, and violation count
- [ ] AC3: Clicking an attempt navigates to the result detail view
- [ ] AC4: History is scoped to the authenticated user only

### Technical Notes

- **Endpoint**: GET /api/v1/examrooms/:id/sessions/:sessionId/attempts/:attemptId
- **Data Required**: ExamAttempt listings per session
- **Dependencies**: PERM002, PERM003, PERM030

### Screens

- SCR029: MyExamsPage / SessionHistoryDialog

---

## US053: Access Flashcard Study

**Type**: ui
**Interaction**: navigation
**Priority**: high
**Estimate**: 2

### User Story

As a **student**, I want to **access** a flashcard set for study so that I can review and memorize content.

### Acceptance Criteria

- [ ] AC1: FlashcardStudyPage loads the flashcard set
- [ ] AC2: Access check passes for public sets, set owners, or correct access code
- [ ] AC3: Turnstile bot protection is enforced on access check
- [ ] AC4: Unauthenticated users are redirected to login

### Technical Notes

- **Endpoint**: GET /study-flashcard/:id
- **Data Required**: FlashCardSet, FlashCard listings
- **Dependencies**: PERM002, PERM003, PERM032, PERM042

### Screens

- SCR030: FlashcardStudyPage

---

## US054: Enter Flashcard Access Code

**Type**: ui
**Interaction**: primary-action
**Priority**: medium
**Estimate**: 1

### User Story

As a **student**, I want to **enter** an access code for a protected flashcard set so that I can unlock and study the content.

### Acceptance Criteria

- [ ] AC1: AccessModal prompts for 6-digit access code
- [ ] AC2: Correct code unlocks the study interface
- [ ] AC3: Incorrect code shows error with retry option
- [ ] AC4: Set owners bypass the access code requirement

### Technical Notes

- **Endpoint**: N/A (client-side access check)
- **Data Required**: accessCode
- **Dependencies**: PERM002, PERM003, PERM033, PERM042

### Screens

- SCR030: FlashcardStudyPage / AccessModal

---

## US055: Study Flashcards

**Type**: ui
**Interaction**: navigation
**Priority**: high
**Estimate**: 2

### User Story

As a **student**, I want to **study** flashcards by flipping, navigating, and tracking my progress so that I can effectively memorize the content.

### Acceptance Criteria

- [ ] AC1: FlipCard flips between front (question) and back (answer) with animation
- [ ] AC2: NavControls allow navigating to previous/next card
- [ ] AC3: Keyboard shortcuts work: ArrowLeft/Right for navigation, Space/Enter for flip
- [ ] AC4: Progress is auto-saved on each card navigation
- [ ] AC5: ProgressBar shows study progress within the set

### Technical Notes

- **Endpoint**: addStudiedCardApi (internal)
- **Data Required**: flashcardId, studied status
- **Dependencies**: PERM002, PERM003, PERM034

### Screens

- SCR030: FlashcardStudyPage

---

## US056: Enter Exam Session

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **student**, I want to **enter** an exam session so that I can view session details and start or resume an attempt.

### Acceptance Criteria

- [ ] AC1: ExamSessionPage displays session title, description, time window, and time limit
- [ ] AC2: CountdownTimer shows time until start or time remaining
- [ ] AC3: Access check is enforced (public/whitelist/code)
- [ ] AC4: In-progress attempts can be resumed
- [ ] AC5: Session host always has access

### Technical Notes

- **Endpoint**: GET /api/v1/examsessions/:id
- **Data Required**: ExamSession, ExamAttempt (in-progress)
- **Dependencies**: PERM002, PERM003, PERM027

### Screens

- SCR031: ExamSessionPage

---

## US057: Enter Session Access Code

**Type**: ui
**Interaction**: primary-action
**Priority**: medium
**Estimate**: 1

### User Story

As a **student**, I want to **enter** an access code for a protected exam session so that I can unlock and attempt the exam.

### Acceptance Criteria

- [ ] AC1: AccessCodeDialog prompts for 6-digit OTP access code
- [ ] AC2: Correct code grants access to the session
- [ ] AC3: Incorrect code shows error with retry option
- [ ] AC4: Host always bypasses access code

### Technical Notes

- **Endpoint**: GET /api/v1/examsessions/:id (with access code in body/params)
- **Data Required**: accessCode
- **Dependencies**: PERM002, PERM003, PERM027, PERM045

### Screens

- SCR031: ExamSessionPage / AccessCodeDialog

---

## US058: Start Exam Attempt

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 3

### User Story

As a **student**, I want to **start** a new exam attempt so that I can answer questions within the session's time window.

### Acceptance Criteria

- [ ] AC1: Start button is enabled only when session is active and no in-progress attempt exists
- [ ] AC2: Attempt limit is checked before starting
- [ ] AC3: Questions are fetched encrypted via secure-quiz endpoint and decrypted client-side
- [ ] AC4: Fullscreen confirmation is shown before entering exam mode
- [ ] AC5: Student is navigated to ExamQuizPage with attempt context

### Technical Notes

- **Endpoint**: POST /api/v1/secure-quiz
- **Data Required**: sessionId, attemptId
- **Dependencies**: PERM002, PERM003, PERM028

### Screens

- SCR031: ExamSessionPage
- SCR032: ExamQuizPage

---

## US059: Resume Exam Attempt

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **student**, I want to **resume** an in-progress exam attempt so that I can continue answering questions without losing my progress.

### Acceptance Criteria

- [ ] AC1: Resume button is shown when an in-progress attempt exists for the session
- [ ] AC2: Resuming restores last saved question index and answer state
- [ ] AC3: Decrypted questions are served from the secure-quiz endpoint
- [ ] AC4: Student is navigated to ExamQuizPage at the last saved position

### Technical Notes

- **Endpoint**: POST /api/v1/secure-quiz
- **Data Required**: sessionId, attemptId
- **Dependencies**: PERM002, PERM003, PERM029

### Screens

- SCR031: ExamSessionPage
- SCR032: ExamQuizPage

---

## US060: Answer Exam Question

**Type**: ui
**Interaction**: navigation
**Priority**: high
**Estimate**: 2

### User Story

As a **student**, I want to **answer** exam questions so that I can complete my attempt before the time limit expires.

### Acceptance Criteria

- [ ] AC1: Each question displays question text and radio option answers
- [ ] AC2: Selecting an answer updates the attempt state
- [ ] AC3: Progress is auto-saved every 30 seconds via background polling
- [ ] AC4: Tab switch / window blur triggers cheating detection warning
- [ ] AC5: sendBeacon fires on tab close for final auto-save

### Technical Notes

- **Endpoint**: PUT /api/v1/examattempts/:attemptId/progress (auto-save)
- **Data Required**: currentIndex, answers, markedQuestions, timeSpentSeconds
- **Dependencies**: PERM002, PERM003, PERM030

### Screens

- SCR032: ExamQuizPage

---

## US061: Submit Exam Attempt

**Type**: ui
**Interaction**: primary-action
**Priority**: high
**Estimate**: 2

### User Story

As a **student**, I want to **submit** my exam attempt so that my answers are graded and I receive my final score.

### Acceptance Criteria

- [ ] AC1: Submit button sends encrypted answers via JWT-wrapped secure-submit endpoint
- [ ] AC2: Submission is also triggered automatically when session time limit expires
- [ ] AC3: Student is shown a confirmation before final submission
- [ ] AC4: After submission, student is shown results (score, pass/fail)
- [ ] AC5: Cheating logs are submitted alongside answers

### Technical Notes

- **Endpoint**: POST /api/v1/secure-submit, POST /api/v1/cheatinglogs
- **Data Required**: encrypted answers, attemptId, cheatingLogs
- **Dependencies**: PERM002, PERM003, PERM031

### Screens

- SCR032: ExamQuizPage

---

## US062: View Own Exam Results

**Type**: ui
**Interaction**: navigation
**Priority**: medium
**Estimate**: 2

### User Story

As a **student**, I want to **view** my exam attempt results so that I can review my performance and see which answers were correct.

### Acceptance Criteria

- [ ] AC1: Exam results show score, pass/fail status, and time spent
- [ ] AC2: Student can review individual question answers (correct/incorrect)
- [ ] AC3: Results are accessible from MyExamsPage attempt history and ExamQuizPage
- [ ] AC4: Student can only view their own results (403 for others' attempts)

### Technical Notes

- **Endpoint**: GET /api/v1/examrooms/:id/sessions/:sessionId/attempts/:attemptId
- **Data Required**: ExamAttempt, QuizQuestion (decrypted)
- **Dependencies**: PERM002, PERM003, PERM030

### Screens

- SCR029: MyExamsPage / SessionHistoryDialog
- SCR032: ExamQuizPage

---

## Screen → US Map

| Screen | US Codes |
|--------|---------|
| SCR001 | US001 |
| SCR002 | `[IPE_ZERO]` — static content page |
| SCR003 | US002 |
| SCR004 | `[IPE_ZERO]` — static legal page |
| SCR005 | `[IPE_ZERO]` — static legal page |
| SCR006 | `[IPE_ZERO]` — static legal page |
| SCR007 | `[IPE_ZERO]` — static security page |
| SCR008 | US003, US004 |
| SCR009 | US005 |
| SCR010 | US006 |
| SCR011 | US007 |
| SCR012 | `[IPE_ZERO]` — passive system redirect |
| SCR013 | US008, US009, US010 |
| SCR014 | US011 |
| SCR015 | US012 |
| SCR016 | US013, US014, US015, US016, US017, US018, US019 |
| SCR017 | US016, US022, US023 |
| SCR018 | US024, US025, US026, US027 |
| SCR019 | US026 |
| SCR020 | US024, US025 |
| SCR021 | US013, US015, US019, US021 |
| SCR022 | US014, US028, US029, US030, US031 |
| SCR023 | US017, US032, US033, US034, US035 |
| SCR024 | US023, US036, US037 |
| SCR025 | US038, US039, US040, US041, US042, US043 |
| SCR026 | US019, US044 |
| SCR027 | US020, US044, US045, US046, US047, US048 |
| SCR028 | US049, US050 |
| SCR029 | US051, US052, US062 |
| SCR030 | US053, US054, US055 |
| SCR031 | US056, US057, US058, US059 |
| SCR032 | US058, US059, US060, US061, US062 |

---

## Cross-Reference Validation

- [x] All US### codes are unique (US001–US062)
- [x] All acceptance criteria are testable
- [x] All technical notes are complete
- [x] All US### codes reference valid SCR### from ScreenList.md
- [x] All `ui` US### mapped to SCR### or SCR###/REG### (parent SCR must exist in ScreenList; system US excluded)
- [x] All US### have a named human actor (guest, student, teacher)
- [x] All US### titles use ONE action verb (anti-CRUD validated)
- [x] `[IPE_ZERO]` screens flagged: SCR002, SCR004, SCR005, SCR006, SCR007, SCR012
