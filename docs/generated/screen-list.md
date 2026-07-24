# Screen List

**Project**: examio
**Generated**: 2026-06-05
**Analysis Scope**: All 32 frontend page files + 5 layout shells + backend route controllers

---

## Screen Index

| Code | Name | Type | Components | Data Displayed |
|------|------|------|-----------|----------------|
| SCR001 | HomePage | atomic | ~1 | QuizSet, FlashCardSet, ExamRoom |
| SCR002 | AboutPage | atomic | ~1 | Static content |
| SCR003 | ContactPage | atomic | ~1 | Static content |
| SCR004 | TermsPage | atomic | ~1 | Static content |
| SCR005 | PrivacyPage | atomic | ~1 | Static content |
| SCR006 | CookiesPage | atomic | ~1 | Static content |
| SCR007 | SecurityPage | atomic | ~1 | Static content |
| SCR008 | LoginPage | atomic | ~2 | OAuth + Email/Password |
| SCR009 | RegisterPage | atomic | ~2 | Registration form + Turnstile |
| SCR010 | ForgotPasswordPage | atomic | ~1 | Email reset form |
| SCR011 | ResetPasswordPage | atomic | ~1 | OTP + new password form |
| SCR012 | KRootRedirect | atomic | ~1 | Redirect logic |
| SCR013 | ProfilePage | composite | 6 | User, Device, Subscription, Wallet |
| SCR014 | VerifyPage | atomic | ~1 | Account verification |
| SCR015 | SubscriptionPage | atomic | ~1 | Subscription + Payment QR |
| SCR016 | MyMaterialsPage | composite | 5 | QuizSet, FlashCardSet, ExamRoom |
| SCR017 | FlashcardsPage | atomic | ~3 | FlashCardSet, FlashcardGenerator |
| SCR018 | HistoryPage | composite | 4 | PDF history, Exam history, Stats |
| SCR019 | ExamHistoryPage | atomic | ~2 | Exam attempts |
| SCR020 | PDFHistoryPage | atomic | ~2 | PDF upload history |
| SCR021 | ManageExamPage | atomic | ~3 | ExamRoom, QuizSet CRUD |
| SCR022 | ManageQuizSetDetailPage | atomic | ~4 | QuizSet, Label, Question |
| SCR023 | ManageFlashcardSetDetailPage | atomic | ~4 | FlashCardSet, Label, Flashcard |
| SCR024 | AIToolPage | atomic | ~3 | AI generation, job status |
| SCR025 | GenAIKnowledgePage | composite | 5 | Knowledge files, folders, graphs |
| SCR026 | ManageExamRoomPage | atomic | ~2 | ExamRoom list + create |
| SCR027 | ManageExamRoomDetailPage | composite | 8 | ExamRoom, Session, Stats, Sharing |
| SCR028 | ExamRoomSessionAnalyticsPage | atomic | ~4 | Attempt leaderboard, cheating stats, charts |
| SCR029 | MyExamsPage | atomic | ~3 | Exam sessions, attempt history |
| SCR030 | FlashcardStudyPage | atomic | ~1 | Flashcard flip + study progress |
| SCR031 | ExamSessionPage | atomic | ~1 | ExamRoomDetailTemplate |
| SCR032 | ExamQuizPage | atomic | ~3 | Exam attempt, questions, cheating detection |
| SCR033 | AdminOverviewPage | atomic | ~2 | KPI cards, quick stats, recent activity |
| SCR034 | AdminStatsPage | atomic | ~5 | Time-series charts, user/exam/finance metrics, signup-source breakdown |
| SCR035 | AdminUsersPage | atomic | ~3 | User table with ban/unban/delete/grant actions |
| SCR036 | AdminFinancePage | atomic | ~3 | Refund history, credit adjustments, tier changes |
| SCR037 | AdminLogsPage | atomic | ~2 | Log viewer with SSE stream + polling fallback |
| SCR038 | AdminAuditPage | atomic | ~2 | Audit log table with filters + export |
| SCR039 | AdminPageConfigPage | atomic | ~2 | PageFeatureFlag list + toggle switches |
| SCR040 | WordFamilyPage | atomic | ~2 | WordFamilyCategory grid |
| SCR041 | WordFamilyCategoryPage | atomic | ~2 | Root word chips + generate action |
| SCR042 | WordFamilyDetailPage | atomic | ~5 | Word family tree/list, save, flashcard bridge |
| SCR043 | AdminWordFamilyPage | atomic | ~3 | WordFamilyCategory CRUD table |

---

## SCR001: HomePage

**Type**: atomic

### Description

Public landing page. Entry point for unauthenticated users. Displays featured quiz sets, flashcard sets, and exam rooms with search/browse capability.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| HeroSection | section | Featured content + CTA |
| ContentGrid | grid | Browse quiz sets / flashcard sets |

### Data Displayed

- QuizSet: public quiz collections
- FlashCardSet: public flashcard decks
- ExamRoom: public exam rooms

### Routes/URLs

- `/`

### Related Screens

- SCR008: LoginPage (CTA)
- SCR009: RegisterPage (CTA)

---

## SCR002: AboutPage

**Type**: atomic

### Description

Static informational page about the platform.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| StaticContent | section | Platform description |

### Data Displayed

- Static content only

### Routes/URLs

- `/about`

---

## SCR003: ContactPage

**Type**: atomic

### Description

Static contact page with contact form or information.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| ContactForm | form | Contact submission |

### Data Displayed

- Static content + contact form

### Routes/URLs

- `/contact`

---

## SCR004: TermsPage

**Type**: atomic

### Description

Static terms of service page.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| StaticContent | section | Terms text |

### Data Displayed

- Static legal content

### Routes/URLs

- `/terms`

---

## SCR005: PrivacyPage

**Type**: atomic

### Description

Static privacy policy page.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| StaticContent | section | Privacy policy text |

### Data Displayed

- Static legal content

### Routes/URLs

- `/privacy`

---

## SCR006: CookiesPage

**Type**: atomic

### Description

Static cookie policy page.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| StaticContent | section | Cookie policy text |

### Data Displayed

- Static legal content

### Routes/URLs

- `/cookies`

---

## SCR007: SecurityPage

**Type**: atomic

### Description

Static security information page.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| StaticContent | section | Security features text |

### Data Displayed

- Static content

### Routes/URLs

- `/security`

---

## SCR008: LoginPage

**Type**: atomic

### Description

Authentication page supporting email/password and Google OAuth. Renders sign-in form.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| SigninForm | form | Email/password login |
| GoogleOneTap | component | Google OAuth One Tap |

### Data Displayed

- Auth tokens (stored in localStorage + cookie)

### Routes/URLs

- `/login`

### Related Screens

- SCR009: RegisterPage (link to register)
- SCR010: ForgotPasswordPage (forgot password link)

---

## SCR009: RegisterPage

**Type**: atomic

### Description

Account registration page with Turnstile bot protection.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| SignupForm | form | Registration fields |
| TurnstileGuard | guard | Bot protection |

### Data Displayed

- None (form submission only)

### Routes/URLs

- `/register`

### Related Screens

- SCR008: LoginPage (link to login)

---

## SCR010: ForgotPasswordPage

**Type**: atomic

### Description

Password reset request page. Sends OTP code to user email.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| ForgotPasswordForm | form | Email + OTP send |

### Data Displayed

- None (form submission only)

### Routes/URLs

- `/forgot-password`

### Related Screens

- SCR011: ResetPasswordPage (navigates on success)

---

## SCR011: ResetPasswordPage

**Type**: atomic

### Description

Password reset page. Accepts OTP code + new password.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| ResetPasswordForm | form | OTP + new password |

### Data Displayed

- None (form submission only)

### Routes/URLs

- `/reset-password`

### Related Screens

- SCR010: ForgotPasswordPage (back link)

---

## SCR012: KRootRedirect

**Type**: atomic

### Description

Root redirect for protected `/k/` section. Redirects authenticated users to the default dashboard view.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| Redirect | utility | Navigation redirect |

### Data Displayed

- None

### Routes/URLs

- `/k`

### Related Screens

- SCR016: MyMaterialsPage (redirect target)

---

## SCR013: ProfilePage

**Type**: composite

### Description

User profile management with three independent data regions: profile form, device management, and subscription/wallet display. Each region loads from its own API endpoint with independent loading state.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| ProfileForm | form | Avatar/banner/name/bio update |
| ChangePasswordSection | form | Password change |
| DeviceList | list | Active sessions/devices |
| SubscriptionSection | section | Subscription tier + plans |
| WalletSection | section | Credit balance + transactions |

### Data Displayed

- User: id, email, username, name, avatar, banner, bio
- UserSession: active sessions with device/browser/OS/IP
- Wallet: balance, recent transactions
- UserSubscription: tier, billing cycle, isActive

### Routes/URLs

- `/k/profile`

### Related Screens

- SCR015: SubscriptionPage (subscription management)

### Regions

| Code | Label | Owner | Independence Signals |
|------|-------|-------|---------------------|
| REG001 | ProfileForm | F004_ProfileManagement | Own endpoint `GET/PUT /api/v1/profile`; own loading/error state |
| REG002 | DeviceList | F004_ProfileManagement | Own endpoint `GET /api/v1/devices`; independent list state; separate DELETE mutation |
| REG003 | SubscriptionWallet | F005_Finance | Own endpoints `GET /api/v1/payment/subscription`, `GET /api/v1/wallet/details`; independent refresh |

---

## SCR014: VerifyPage

**Type**: atomic

### Description

Account verification page. Accepts 6-digit OTP from email to activate account.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| VerifyForm | form | OTP input + verify action |

### Data Displayed

- VerifyAccountCode: verification result

### Routes/URLs

- `/k/verify`

---

## SCR015: SubscriptionPage

**Type**: atomic

### Description

Subscription purchase page with plan selection and QR payment via SePay.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| SubscriptionTemplate | template | Plan cards + QR payment |
| QRPaymentDialog | dialog | SePay QR display |

### Data Displayed

- UserSubscription: current plan, status
- Payment: QR code, payment status

### Routes/URLs

- `/k/subscription`

### Related Screens

- SCR013: ProfilePage (redirect after purchase)

---

## SCR016: MyMaterialsPage

**Type**: composite

### Description

Dashboard aggregating three independent content panels: quiz sets, flashcard sets, and exam rooms. Each panel fetches from its own endpoint and has independent CRUD mutations.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| QuizSetGrid | grid | User's quiz sets |
| FlashCardSetGrid | grid | User's flashcard sets |
| ExamRoomGrid | grid | User's exam rooms |
| QuizSetModal | dialog | Create/edit quiz set |
| FlashcardSetModal | dialog | Create/edit flashcard set |
| ExamRoomModal | dialog | Create/edit exam room |

### Data Displayed

- QuizSet: user's authored quiz sets
- FlashCardSet: user's authored flashcard decks
- ExamRoom: user's hosted exam rooms

### Routes/URLs

- `/k/my-materials`

### Related Screens

- SCR022: ManageQuizSetDetailPage (navigate to quiz set detail)
- SCR023: ManageFlashcardSetDetailPage (navigate to flashcard set detail)
- SCR027: ManageExamRoomDetailPage (navigate to exam room detail)

### Regions

| Code | Label | Owner | Independence Signals |
|------|-------|-------|---------------------|
| REG001 | QuizSetGrid | F006_QuizAuthoring | Own endpoint `GET /api/v1/quizsets`; own mutation `POST/PUT/DELETE /api/v1/quizsets` |
| REG002 | FlashCardSetGrid | F007_FlashcardAuthoring | Own endpoint `GET /api/v1/flashcardsets`; own mutation `POST/PUT/DELETE /api/v1/flashcardsets` |
| REG003 | ExamRoomGrid | F008_ExamHosting | Own endpoint `GET /api/v1/examrooms/list`; own mutation `POST/PUT/DELETE /api/v1/examrooms` |

---

## SCR017: FlashcardsPage

**Type**: atomic

### Description

Flashcard set browsing and management page with AI flashcard generation.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| FlashcardSetGrid | grid | Browse flashcard sets |
| FlashcardGenerator | component | AI flashcard generation |
| FlashcardSetModal | dialog | Create/edit flashcard set |

### Data Displayed

- FlashCardSet: browsable flashcard decks

### Routes/URLs

- `/k/flash-card`

### Related Screens

- SCR023: ManageFlashcardSetDetailPage (manage specific deck)

---

## SCR018: HistoryPage

**Type**: composite

### Description

User history hub with three independent data regions: PDF upload history, exam attempt history, and stats summary. Each region fetches from its own parallel API call with independent loading and cache strategy.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| HistoryTemplate | template | Three-panel layout |
| PDFHistoryList | list | AI-processed PDF history |
| ExamHistoryList | list | Past exam attempts |
| ActivityFeed | feed | Recent activity notifications |
| StatsCards | cards | Aggregated study stats |

### Data Displayed

- PDFHistoryItem: uploaded PDFs with processing status
- ExamHistoryItem: past exam attempts with scores
- HistoryStats: total PDFs, exams, study hours

### Routes/URLs

- `/k/history`

### Related Screens

- SCR019: ExamHistoryPage (exam history drill-down)
- SCR020: PDFHistoryPage (PDF history drill-down)

### Regions

| Code | Label | Owner | Independence Signals |
|------|-------|-------|---------------------|
| REG001 | PDFHistoryList | F006_QuizAuthoring | Own endpoint `GET /api/v1/student/recent-flashcards` → `getPDFHistoryApi`; own loading/error state; own download/delete mutations |
| REG002 | ExamHistoryList | F008_ExamHosting | Own endpoint `GET /api/v1/student/recent-exams` → `getExamHistoryApi`; own loading state; independent scroll/pagination |
| REG003 | StatsCards | F008_ExamHosting | Own endpoint `GET /api/v1/quizsets/stats` → `getHistoryStatsApi`; independent 5-min cache via `storeCache` |

---

## SCR019: ExamHistoryPage

**Type**: atomic

### Description

Paginated list of past exam attempts with score and time details.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| ExamHistoryListItem | list-item | Single exam attempt |
| Pagination | nav | Page navigation |

### Data Displayed

- ExamAttempt: scores, timestamps, pass/fail status

### Routes/URLs

- `/k/history/exam`

### Related Screens

- SCR018: HistoryPage (parent)
- SCR032: ExamQuizPage (result review)

---

## SCR020: PDFHistoryPage

**Type**: atomic

### Description

Paginated list of AI-processed PDF uploads with processing status and content generation actions.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| PDFHistoryListItem | list-item | Single PDF record |
| Pagination | nav | Page navigation |

### Data Displayed

- UserStorage: uploaded files with `processingStatus`
- HistoryGeneratedQuizz: quiz count per PDF
- HistoryGeneratedFlashcard: flashcard count per PDF

### Routes/URLs

- `/k/history/pdf`

### Related Screens

- SCR018: HistoryPage (parent)

---

## SCR021: ManageExamPage

**Type**: atomic

### Description

Teacher dashboard for exam room and quiz set management. Supports creating exam rooms and quiz sets via modals.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| ExamRoomList | list | Host's exam rooms |
| QuizSetList | list | Host's quiz sets |
| ExamRoomModal | dialog | Create/edit exam room |
| QuizSetModal | dialog | Create/edit quiz set |

### Data Displayed

- ExamRoom: hosted rooms with session counts
- QuizSet: authored quiz sets

### Routes/URLs

- `/k/manage-exam`

### Related Screens

- SCR026: ManageExamRoomPage (exam room management)
- SCR022: ManageQuizSetDetailPage (quiz set detail)

---

## SCR022: ManageQuizSetDetailPage

**Type**: atomic

### Description

Quiz set authoring page: edit metadata, manage labels, add/edit/delete questions. Questions displayed in a sortable list; labels managed via LabelManager.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| QuizSetHeader | section | Title, description, visibility |
| LabelManager | component | Label CRUD |
| QuestionList | list | Questions with inline editor |
| QuestionEditorDialog | dialog | Full question create/edit |
| InlineQuestionEditor | component | Inline edit mode |

### Data Displayed

- QuizSet: metadata, visibility, labels
- QuizQuestion: question text, options, answer
- QuizSetLabel: chapter/section labels

### Routes/URLs

- `/k/manage-quiz-set/:id`

### Related Screens

- SCR016: MyMaterialsPage (back navigation)
- SCR021: ManageExamPage (back navigation)

---

## SCR023: ManageFlashcardSetDetailPage

**Type**: atomic

### Description

Flashcard set authoring page: edit metadata, manage labels, add/edit/delete flashcards. Flashcards displayed in a list with flip preview.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| FlashcardSetHeader | section | Title, description, visibility |
| FlashcardLabelManager | component | Label CRUD |
| FlashcardList | list | Cards with flip preview |
| FlashcardEditorDialog | dialog | Full flashcard create/edit |
| ViewFlashcardDialog | dialog | Flashcard preview |

### Data Displayed

- FlashCardSet: metadata, visibility, labels
- FlashCard: question/answer pairs
- FlashCardSetLabel: chapter/section labels

### Routes/URLs

- `/k/manage-flashcard-set/:id`

### Related Screens

- SCR016: MyMaterialsPage (back navigation)

---

## SCR024: AIToolPage

**Type**: atomic

### Description

AI generation tool for creating quizzes and flashcards from uploaded documents. Shows job status, allows regeneration.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| TestGenerator | component | Quiz generation UI |
| FlashcardGenerator | component | Flashcard generation UI |
| PendingJobDialog | dialog | Poll status of in-progress jobs |

### Data Displayed

- UserStorage: uploaded files
- HistoryGeneratedQuizz: generated quiz batches
- HistoryGeneratedFlashcard: generated flashcard batches

### Routes/URLs

- `/k/ai-tool`

### Related Screens

- SCR025: GenAIKnowledgePage (knowledge base management)

---

## SCR025: GenAIKnowledgePage

**Type**: composite

### Description

AI knowledge base management with four independent regions: knowledge folders, knowledge files, dataset imports, and knowledge stats. Each region fetches from its own API cluster.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| FolderPanel | panel | Knowledge folder CRUD |
| FilePanel | panel | Knowledge file list + upload |
| DatasetImportPanel | panel | Dataset import jobs |
| StatsPanel | panel | Knowledge base statistics |

### Data Displayed

- UserStorage: uploaded knowledge files with processing status
- Document: chunked + embedded file content
- UserStorageGraph: graph built from file
- AIChat: chat sessions anchored to documents

### Routes/URLs

- `/k/genai-knowledge`

### Regions

| Code | Label | Owner | Independence Signals |
|------|-------|-------|---------------------|
| REG001 | FolderPanel | F009_AITeacherKnowledgeBase | Own endpoints `GET/POST/PUT/DELETE /api/v1/ai/tutor/knowledge-folders`; independent loading state |
| REG002 | FilePanel | F009_AITeacherKnowledgeBase | Own endpoints `GET/POST/DELETE /api/v1/ai/tutor/knowledge-files`; independent reprocess/bulk operations; own pagination |
| REG003 | DatasetImportPanel | F009_AITeacherKnowledgeBase | Own endpoints `GET/POST /api/v1/ai/tutor/dataset-imports`; independent job polling |
| REG004 | StatsPanel | F009_AITeacherKnowledgeBase | Own endpoint `GET /api/v1/ai/tutor/knowledge-stats`; independent refresh |

---

## SCR026: ManageExamRoomPage

**Type**: atomic

### Description

Teacher exam room listing page with create exam room action.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| ExamRoomList | list | Host's exam rooms |
| ExamRoomForm | form | Create/edit exam room |

### Data Displayed

- ExamRoom: hosted rooms with session counts

### Routes/URLs

- `/k/manage-exam-room`

### Related Screens

- SCR027: ManageExamRoomDetailPage (room detail)

---

## SCR027: ManageExamRoomDetailPage

**Type**: composite

### Description

Exam room detail page with four independent regions: stats overview, room info, session list, and sharing dialog. Session list has its own pagination state.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| StatsGrid | cards | Session count, participant, attempt stats |
| RoomInfoSection | section | Room metadata display |
| SessionTable | table | Paginated session list |
| ExamSessionFormModal | dialog | Create/edit session |
| ShareDialog | dialog | Access code + link sharing |
| DeleteConfirmDialog | dialog | Session deletion |

### Data Displayed

- ExamRoom: room metadata, quiz set, host info
- ExamSession: sessions with status, participant counts
- ExamAttempt: attempt counts per session

### Routes/URLs

- `/k/manage-exam-room/:id`

### Related Screens

- SCR026: ManageExamRoomPage (back navigation)
- SCR028: ExamRoomSessionAnalyticsPage (session analytics)

### Regions

| Code | Label | Owner | Independence Signals |
|------|-------|-------|---------------------|
| REG001 | StatsGrid | F008_ExamHosting | Computed from sessions data; own stats display (total/ongoing/participants/attempts) |
| REG002 | RoomInfoSection | F008_ExamHosting | Own endpoint `GET /api/v1/examrooms/detail/:id` via `useExamRoomStore`; independent fetch |
| REG003 | SessionTable | F008_ExamHosting | Own endpoint `GET /api/v1/examsessions/list` via `useExamRoomDetailStore`; own pagination state `sessionsPage`; own create/update/delete mutations |
| REG004 | ShareDialog | F008_ExamHosting | Own endpoint `GET/PUT /api/v1/examsessions/:id/sharing`; independent code generation |

---

## SCR028: ExamRoomSessionAnalyticsPage

**Type**: atomic

### Description

Session analytics for exam host: attempt leaderboard, score distribution chart, cheating violation stats, and per-user detail sheet. Data is loaded once via `Promise.all` and processed client-side.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| ScoreBarChart | chart | Score distribution (BarChart) |
| ViolationPieChart | chart | Violation type breakdown (PieChart) |
| AttemptTable | table | Student leaderboard with sort |
| AttemptDetailSheet | sheet | Per-user attempt history + violations |

### Data Displayed

- ExamAttempt: scores, violations, time spent
- CheatingLog: per-user violation counts by type
- ExamSession: session metadata (title, passing score)

### Routes/URLs

- `/k/manage-exam-room/:id/session/:sessionId`

### Related Screens

- SCR027: ManageExamRoomDetailPage (back navigation)

---

## SCR029: MyExamsPage

**Type**: atomic

### Description

Student exam session browser with session cards, attempt history dialog, and pagination. Groups attempts by session and surfaces in-progress vs. completed states.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| SessionCard | card | Session summary with attempt count + best score |
| SessionHistoryDialog | dialog | Attempt history per session |
| Pagination | nav | Page navigation |

### Data Displayed

- ExamSession: sessions the student has attempted
- ExamAttempt: attempts grouped by session, best score, violation count

### Routes/URLs

- `/k/my-exams`

### Related Screens

- SCR031: ExamSessionPage (session entry)
- SCR032: ExamQuizPage (exam attempt)

---

## SCR030: FlashcardStudyPage

**Type**: atomic

### Description

Flashcard study interface with flip animation, keyboard navigation, sound effects, shuffle, and progress tracking. Access-gated (Turnstile + optional code).

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| FlipCard | component | Front/back flashcard with 3D flip |
| ProgressBar | bar | Study progress indicator |
| NavControls | controls | Previous/Next + card dots |
| AccessModal | dialog | Access code gate |
| TurnstileGuard | guard | Bot protection on access check |

### Data Displayed

- FlashCard: question/answer pairs
- FlashcardStudyProgress: studied card IDs

### Routes/URLs

- `/study-flashcard/:id`

### Related Screens

- SCR016: MyMaterialsPage (back to dashboard)
- SCR023: ManageFlashcardSetDetailPage (edit deck)

### Notes

- Keyboard navigation: ArrowLeft/Right for prev/next, Space/Enter for flip.
- Progress auto-saved via `addStudiedCardApi` on each "next" action.
- Optimistic pin toggle on session card (SCR029).

---

## SCR031: ExamSessionPage

**Type**: atomic

### Description

Exam session entry page rendered via ExamRoomDetailTemplate. Handles access check (whitelist/code/public), countdown timer, attempt resume, and navigation to quiz. Uses ExamSessionLayout wrapper.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| ExamRoomDetailTemplate | template | Session info + start button + attempt list |
| AccessCodeDialog | dialog | 6-digit OTP access gate |
| CountdownTimer | component | Time until start/end |

### Data Displayed

- ExamSession: title, description, start/end time, time limit, max attempts
- ExamAttempt: in-progress and past attempts

### Routes/URLs

- `/exam-session/:id`

### Related Screens

- SCR032: ExamQuizPage (start/resume exam)
- SCR029: MyExamsPage (back navigation)

---

## SCR032: ExamQuizPage

**Type**: atomic

### Description

Active exam-taking interface. Fetches encrypted questions via `secure-quiz` endpoint, decrypts client-side with AES-256-CBC, submits answers via JWT-wrapped secure-submit. Background polling for attempt progress, cheating detection hook, and `sendBeacon` on tab close.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| QuizOptionRow | component | Single question with radio options |
| CheatingWarningModal | modal | Violation warning display |
| ProgressAutoSave | hook | setInterval polling every 30s |
| FullscreenConfirmDialog | dialog | Fullscreen entry confirmation |

### Data Displayed

- ExamAttempt: answers, currentIndex, markedQuestions, timeSpentSeconds
- QuizQuestion: decrypted question text + options

### Routes/URLs

- `/exam-session/:id/quiz`

### Related Screens

- SCR031: ExamSessionPage (back on submit/cancel)
- SCR028: ExamRoomSessionAnalyticsPage (host views results)

### Notes

- Background: `setInterval` polls `updateExamAttemptProgressApi` every 30s.
- `sendBeacon` fires on `beforeunload` for final auto-save.
- Cheating detection via `useCheatingDetection` hook (tab switch, window blur, devtools, copy-paste).

---

## SCR033: AdminOverviewPage

**Type**: atomic

### Description

Admin dashboard home page. Displays KPI cards (total users, active sessions, revenue today, pending refunds) and recent activity feed. Quick-navigate links to other admin sections.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| AdminKPICards | atomic | KPI stat cards (count, delta, trend) |
| AdminRecentActivity | atomic | Recent admin actions feed |

### Routes

- `GET /api/v1/admin/bootstrap`
- `GET /api/v1/admin/stats`

### Auth

- `AdminGuard` — `User.isAdmin = true` required. Non-admins receive 403.

---

## SCR034: AdminStatsPage

**Type**: atomic

### Description

Detailed analytics page with time-series charts for user growth, exam sessions, revenue, and AI usage. Date range picker, export functionality, and a signup-source ("Top nguồn") breakdown card.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| AdminTimeSeriesChart | atomic | Recharts time-series chart |
| AdminDateRangePicker | atomic | Date range filter |
| AdminStatsExport | atomic | CSV/JSON export |
| SourceBreakdownChart | atomic | Signup breakdown by `utm_source` (null → "direct") |

### Routes

- `GET /api/v1/admin/stats`
- `GET /api/v1/admin/stats/sources` (+ alias `GET /api/v1/admin/sources`)

### Auth

- `AdminGuard` — `User.isAdmin = true` required.

---

## SCR035: AdminUsersPage

**Type**: atomic

### Description

User management page with paginated antd Table. Columns: avatar, name, email, role, status, created date. Row actions: ban, unban, soft-delete, grant admin, revoke admin. Search and filter by status/role.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| AdminUserTable | atomic | antd Table with pagination + filters |
| AdminUserActions | atomic | Row action buttons (ban/unban/delete/grant) |
| AdminBanDialog | atomic | Confirmation dialog for ban/unban |

### Routes

- `GET /api/v1/admin/users`
- `PUT /api/v1/admin/users/:id/ban`
- `PUT /api/v1/admin/users/:id/unban`
- `DELETE /api/v1/admin/users/:id`
- `PUT /api/v1/admin/users/:id/grant-admin`
- `DELETE /api/v1/admin/users/:id/revoke-admin`

### Auth

- `AdminGuard` — `User.isAdmin = true` required.

---

## SCR036: AdminFinancePage

**Type**: atomic

### Description

Finance management page with tabs: Refund History, Credit Adjustments, Subscription Tier Changes. Each tab shows a paginated antd Table with relevant details and action buttons.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| AdminFinanceTabs | atomic | Tabbed interface (refunds / credits / tiers) |
| AdminRefundTable | atomic | Refund history table |
| AdminCreditAdjustDialog | atomic | Dialog for manual credit adjustment |
| AdminTierChangeDialog | atomic | Dialog for subscription tier change |

### Routes

- `GET /api/v1/admin/finance/refunds`
- `POST /api/v1/admin/finance/refund`
- `POST /api/v1/admin/finance/adjust-credit`
- `PUT /api/v1/admin/finance/subscription-tier`

### Auth

- `AdminGuard` — `User.isAdmin = true` required.

---

## SCR037: AdminLogsPage

**Type**: atomic

### Description

Server-side log viewer with real-time SSE streaming (ticket exchange) and polling fallback. Filter by log level (info/warn/error), service name, and time range. Logs displayed in scrollable terminal-style view.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| AdminLogViewer | atomic | Scrollable log display |
| AdminLogFilters | atomic | Level/service/time range filters |
| AdminLogStreamToggle | atomic | Toggle SSE vs polling mode |

### Routes

- `GET /api/v1/admin/logs`
- `GET /api/v1/admin/logs/stream`

### Auth

- `AdminGuard` — `User.isAdmin = true` required.

---

## SCR038: AdminAuditPage

**Type**: atomic

### Description

Audit log query page. Paginated antd Table showing `AdminAudit` rows: admin user, target, action, payload diff, IP, user agent, timestamp. Filters by action type, admin user, and date range. Export to CSV.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| AdminAuditTable | atomic | Paginated audit log table |
| AdminAuditFilters | atomic | Action type, admin, date range filters |
| AdminAuditExport | atomic | CSV export button |

### Routes

- `GET /api/v1/admin/audit`

### Auth

- `AdminGuard` — `User.isAdmin = true` required.

---

## SCR039: AdminPageConfigPage

**Type**: atomic

### Description

Admin screen listing every togglable page (`PageFeatureFlag` rows) with a `Switch` per row. Toggling calls the admin API with optimistic update + rollback on failure. Source: `examio-fe/src/pages/admin/AdminPageConfigPage.tsx`.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| PageConfigTable | atomic | antd Table listing key/label/enabled |
| PageConfigSwitch | atomic | Per-row toggle with optimistic update + rollback |

### Routes

- `GET /api/v1/admin/page-config`
- `PATCH /api/v1/admin/page-config/:key`

### Auth

- `AdminGuard` — `User.isAdmin = true` required.

---

## SCR040: WordFamilyPage

**Type**: atomic

### Description

Category browse page — grid of `WordFamilyCategory` cards (image, name, description), filtered to `isActive = true`. Each card links to `SCR041`. Source: `examio-fe/src/pages/k/WordFamilyPage.tsx`.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| WordFamilyCategoryCard | atomic | Category image/name/description card |

### Routes

- `GET /api/v1/word-family/categories`

### Auth

- `AuthGuard` + `PageEnabledGuard` (`@TogglePage('word-family')`) — Bearer session required; hidden via 404 if the `word-family` page flag is disabled.

---

## SCR041: WordFamilyCategoryPage

**Type**: atomic

### Description

Root-word list within one category, shown as chips. "Tạo thêm từ gốc" button triggers AI generation (`POST /generate`) then refetches with `forceRefresh`. Source: `examio-fe/src/pages/k/WordFamilyCategoryPage.tsx`.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| RootWordChipList | atomic | Chips for each root word, links to SCR042 |
| GenerateWordFamilyButton | atomic | Triggers AI batch generation, shows loading state |

### Routes

- `GET /api/v1/word-family/categories/:slug/roots`
- `POST /api/v1/word-family/generate`

### Auth

- `AuthGuard` + `PageEnabledGuard` (`@TogglePage('word-family')`).

---

## SCR042: WordFamilyDetailPage

**Type**: atomic

### Description

Word family detail with Tree/List view toggle, word selection checkboxes, save-to-collection action, and "Tạo Flashcard (N)" bridge to a new `FlashCardSet`. Source: `examio-fe/src/pages/k/WordFamilyDetailPage.tsx`.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| TreeView | atomic | Word family as expandable tree (`components/k/word-family/TreeView.tsx`) |
| ListView | atomic | Word family as flat list (`ListView.tsx`) |
| WordFamilyNode | atomic | Single word node with affix breakdown |
| CreateFlashcardModal | atomic | Confirms selected words → `POST /:id/to-flashcard` |

### Routes

- `GET /api/v1/word-family/category/:categorySlug/:rootWord`
- `POST /api/v1/word-family/save`
- `DELETE /api/v1/word-family/saved/:wordFamilyId`
- `POST /api/v1/word-family/:id/to-flashcard`

### Auth

- `AuthGuard` + `PageEnabledGuard` (`@TogglePage('word-family')`).

---

## SCR043: AdminWordFamilyPage

**Type**: atomic

### Description

Admin CRUD for `WordFamilyCategory` — antd Table + Modal, auto-slug generator from Vietnamese name. Calls admin-service endpoints (`/admin/word-family/*`), distinct from the exam-service admin category routes. Source: `examio-fe/src/pages/admin/AdminWordFamilyPage.tsx`.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| WordFamilyCategoryTable | atomic | Paginated category list |
| WordFamilyCategoryModal | atomic | Create/edit form with auto-slug |

### Routes

- `GET /api/v1/admin/word-family/categories`
- `POST /api/v1/admin/word-family/categories`
- `PUT /api/v1/admin/word-family/categories/:id`
- `DELETE /api/v1/admin/word-family/categories/:id` (soft-delete)

### Auth

- `AdminGuard` — `User.isAdmin = true` required.

---

## Summary

- **Total Screens**: 43
- **Atomic**: 37 (SCR001–SCR012, SCR014–SCR015, SCR017, SCR019–SCR024, SCR026, SCR028–SCR038, SCR039–SCR043)
- **Composite**: 6 (SCR013, SCR016, SCR018, SCR025, SCR027)
- **Total Regions**: 16 across composite screens

---

## Cross-Reference Validation

- [x] All SCR### codes are unique (SCR001–SCR043)
- [x] All SCR### codes are referenced in ScreenFlow.md
- [x] All route URLs are properly formatted
- [x] All SCR### codes are referenced in FeatureList.md
- [x] No orphaned screen references
- [x] REG### codes are per-screen (REG001 under SCR013 is distinct from REG001 under SCR016, etc.)
- [x] H6 layout shells (KLayout, PublicLayout, AuthLayout, ExamSessionLayout) documented as shared context, no SCR emitted for shell itself
