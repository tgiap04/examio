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
