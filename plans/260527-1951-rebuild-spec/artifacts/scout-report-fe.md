# Frontend Scout Report: examio-fe

**Project**: examio-fe (React 19 + Vite + TypeScript + Yarn 4)
**Date**: 2026-05-27
**Path**: `/Users/tgiap.dev/devs/examio/examio-fe/`

---

## 1. Architecture Overview

- **Framework**: Vite 7 + React 19 + TypeScript 5.9
- **Package Manager**: Yarn 4.9.2
- **Routing**: React Router DOM v7.9.3 (createBrowserRouter)
- **HTTP Client**: Axios 1.12 with interceptors for auth token injection + refresh
- **State**: Zustand 5 (11 stores)
- **Styling**: Tailwind CSS v4 + Ant Design v6.3.7 + custom CSS
- **Entry**: `src/main.tsx` -> wraps App in `AppProviders` -> `App.tsx` renders `RouterProvider`

---

## 2. Directory Structure

```
src/
  apis/          23 files (Axios API clients)
  app/           1 file (GenAI Knowledge page)
  components/    120+ files (atoms/molecules/organisms)
  hooks/         6 files
  lib/           15 files
  pages/         25 files (page-level components)
  provider/      3 files
  routes/        5 files
  stores/        11 files (Zustand)
  templates/     10 files
  types/         8 files
```

---

## 3. Pages & Routes

### Route Definition: `src/routes/index.tsx`

React Router v7 flat route config using `createBrowserRouter`. Each route wraps its page component in a layout and optional guard.

### Route Guards

| File | Purpose |
|---|---|
| `src/routes/guards/ProtectedRoute.tsx` | Redirects to `/login` if `isAuthenticated === false`. Shows loading state while `initializing`. Stores return path via `setRedirectBackTarget`. |
| `src/routes/guards/PublicRoute.tsx` | Redirects to `/k` if already authenticated. |
| `src/routes/guards/TeacherRoute.tsx` | Checks `isAuthenticated` but does NOT check teacher role (incomplete). Redirects to `/login` if not auth'd. |

### Route Layouts

| File | Description |
|---|---|
| `src/routes/layouts/PublicLayout.tsx` | Header + Footer + GoogleOneTap for landing pages |
| `src/routes/layouts/AuthLayout.tsx` | Minimal wrapper (empty div) for auth forms |
| `src/routes/layouts/KLayout.tsx` | Authenticated workspace layout with sidebar, header, search bar, theme toggle, verification banner, pending job dialog |

### Route Table

| Path | Page | Guard | Layout |
|---|---|---|---|
| `/` | `HomePage` | None | PublicLayout |
| `/about` | `AboutPage` | None | PublicLayout |
| `/contact` | `ContactPage` | None | PublicLayout |
| `/terms` | `TermsPage` | None | PublicLayout |
| `/privacy` | `PrivacyPage` | None | PublicLayout |
| `/cookies` | `CookiesPage` | None | PublicLayout |
| `/security` | `SecurityPage` | None | PublicLayout |
| `/login` | `LoginPage` | PublicRoute | AuthLayout |
| `/register` | `RegisterPage` | PublicRoute | AuthLayout |
| `/forgot-password` | `ForgotPasswordPage` | PublicRoute | AuthLayout |
| `/reset-password` | `ResetPasswordPage` | PublicRoute | AuthLayout |
| `/k` | `KRootRedirect` | ProtectedRoute | KLayout |
| `/k/profile` | `ProfilePage` | ProtectedRoute | KLayout |
| `/k/verify` | `VerifyPage` | ProtectedRoute | KLayout |
| `/k/subscription` | `SubscriptionPage` | ProtectedRoute | KLayout |
| `/k/my-materials` | `MyMaterialsPage` | ProtectedRoute | KLayout |
| `/k/flash-card` | `FlashcardsPage` | ProtectedRoute | KLayout |
| `/k/history` | `HistoryPage` | ProtectedRoute | KLayout |
| `/k/history/exam` | `ExamHistoryPage` | ProtectedRoute | KLayout |
| `/k/history/pdf` | `PDFHistoryPage` | ProtectedRoute | KLayout |
| `/k/manage-exam` | `ManageExamPage` | ProtectedRoute | KLayout |
| `/k/manage-quiz-set/:id` | `ManageQuizSetDetailPage` | ProtectedRoute | KLayout |
| `/k/manage-flashcard-set/:id` | `ManageFlashcardSetDetailPage` | ProtectedRoute | KLayout |
| `/k/ai-tool` | `AIToolPage` | ProtectedRoute | KLayout |
| `/k/genai-knowledge` | `GenAIKnowledgePage` | ProtectedRoute | KLayout |
| `/k/manage-exam-room` | `ManageExamRoomPage` | ProtectedRoute | KLayout |
| `/k/manage-exam-room/:id` | `ManageExamRoomDetailPage` | ProtectedRoute | KLayout |
| `/k/manage-exam-room/:id/session/:sessionId` | `ExamRoomSessionAnalyticsPage` | ProtectedRoute | KLayout |
| `/k/my-exams` | `MyExamsPage` | ProtectedRoute | KLayout |
| `/study-flashcard/:id` | `FlashcardStudyPage` | None | None (standalone) |
| `/exam-session/:id` | `ExamSessionPage` | None | None (standalone) |
| `/exam-session/:id/quiz` | `ExamQuizPage` | None | None (standalone) |

**Note**: The study/exam-session routes have NO auth guard -- they handle their own access control via API-level checks.

---

## 4. API Clients (`src/apis/`)

### Base Configuration (`src/apis/api.ts`)

- Axios instance created with `baseURL` from `env.apiUrl`, `withCredentials: true`
- **Request interceptor**: Injects `Bearer {auth_token}` from `localStorage`; adds `X-Device-ID` header
- **Response interceptor**: On 401, attempts token refresh via `POST /auth/refresh`. If refresh fails, calls `handleAuthFailure()` which clears tokens and redirects to `/login`. Handles special error codes: `SESSION_INVALIDATED`, `SESSION_EXPIRED`, `MODEL_UNAVAILABLE`, `MODEL_INSUFFICIENT_VRAM`, `MODEL_RUNTIME_ERROR`.

### API Endpoints (23 files)

| File | Base Endpoint | Purpose |
|---|---|---|
| `authApi.ts` | `/auth/*` | Login, register, logout, refresh, verify, change password, sync-refresh-token |
| `subjectApi.ts` | `/subjects/*` | Subject categories, flat subjects list |
| `examApi.ts` | `/ai/generate-from-file` | AI exam generation from PDF (multipart form upload) |
| `examRoomApi.ts` | `/examrooms/*` | CRUD exam rooms, sessions list, available labels |
| `examSessionApi.ts` | `/examsessions/*` | CRUD exam sessions, access control, sharing settings, stats |
| `examAttemptApi.ts` | `/examattempts/*` | Start/resume/submit attempts, progress update, secure quiz (encrypted), owner listing |
| `flashcardSetApi.ts` | `/flashcardsets/*` | CRUD flashcard sets + flashcards + labels, sharing, access control, search users |
| `flashcardStudyApi.ts` | `/flashcard-study/*` | Spaced repetition study sessions, progress tracking, review cards |
| `quizsetApi.ts` | `/quizsets/*` | CRUD quiz sets + questions + labels, save from history |
| `aiApi.ts` | `/ai/*` | AI models catalog, file uploads, regenerate, job status polling, cancel |
| `aiChatApi.ts` | `/ai-chat/*` | Chat CRUD, messages, streaming (SSE), image upload, multi-document support |
| `virtualTeacherApi.ts` | `/virtual-teacher/*` | Legacy virtual teacher chat + file upload + quick upload |
| `genaiTutorKnowledgeApi.ts` | `/ai/tutor/knowledge-*` | GenAI knowledge base: folders, files, stats, dataset imports, graph, bulk operations |
| `historyApi.ts` | `/examattempts/history-stats`, `/ai/recent-uploads` | History stats, PDF history, exam history |
| `studentMaterialsApi.ts` | `/student/*` | Recent flashcards/exams, pin/unpin, share links |
| `profileApi.ts` | `/profile/*` | User profile CRUD, avatar/banner upload to R2 |
| `subscriptionApi.ts` | `/wallet/*`, `/payment/*` | Wallet details, payment creation (QR), subscription plans, payment status |
| `mediaApi.ts` | `/r2/image` | Generic R2 image upload |
| `devicesApi.ts` | `/devices/*` | List/logout devices |
| `cheatingLogApi.ts` | `/cheatinglogs/*` | Log violations, get logs/stats, user attempts with logs |

**Backend services consumed**: A single backend service at `VITE_API_URL=/api/v1` (proxy). Endpoints follow RESTful patterns with pagination. Notable: exam generation uses async job queue with polling (`/ai/job/:id`).

---

## 5. State Management (`src/stores/`)

11 Zustand stores, all created with `create()`:

| Store | State Slice | Purpose |
|---|---|---|
| `useAuthStore` | `user`, `isAuthenticated`, `loading`, `initializing` | Auth lifecycle: login, signup, logout, getUser, refreshSession, verify, Google OAuth redirect |
| `useExamRoomStore` | `examRooms`, `currentExamRoom`, `loading`, `error` | CRUD exam rooms with `storeCache` |
| `useExamRoomDetailStore` | `sessions`, loading states | Sessions under an exam room with `storeCache` |
| `useExamSessionStore` | `examSessions`, `currentExamSession` | CRUD exam sessions with `storeCache` |
| `useQuizSetStore` | `quizSetsK`, `currentQuizSet`, `loading` | CRUD quiz sets + questions + labels with `storeCache` |
| `useFlashcardSetStore` | `flashcardSetsK`, `currentFlashcardSet` | CRUD flashcard sets + flashcards with `storeCache` |
| `useAIGeneratorStore` | 3 sub-stores: `useJobStore`, `useTestGeneratorStore`, `useFlashcardGeneratorStore`, `useRecentUploadsStore` | AI generation orchestration: job queue polling, file management, credit checking, cross-store sync |
| `useAITeacherStore` | Extensive chat state, subjects, streaming, TTS, files | AI teacher chat with SSE streaming, voice TTS, document attachments |
| `useAIModelCatalogStore` | `catalog`, `generationModels`, `defaultModel` | Lazy-loads AI model catalog from `/ai/models` |
| `useStatsStore` | `flashcardStats`, `quizStats` | Dashboard stats (fetched with raw fetch, not axios) |
| `useStudentMaterialsStore` | Paginated caches for flashcards + exams | Recent student materials with page-based cache |
| `useGenAIKnowledgeStore` | `folders`, `files`, `hydrated` | Knowledge base manager state with localStorage persistence |

**Cache layer**: Custom `storeCache` (`src/lib/storeCache.ts`) -- in-memory Map with TTL-based expiry. Used by most stores to reduce redundant API calls. Cache keys are parameter-prefix strings. Invalidated on mutations.

---

## 6. Auth Strategy

### Token Storage
- `auth_token` in `localStorage` + duplicate cookie (`token`) for SSR/browser refresh compatibility
- `refresh_token` in `localStorage`
- `session_id` in `localStorage`
- The `useAuthSync` hook (`src/hooks/useAuthSync.ts`) bootstraps auth on mount:
   1. Reads `token`, `refreshToken`, `sessionId` from URL query params (OAuth redirect)
   2. Strips them from URL via `history.replaceState`
   3. Calls `getUser()` if token exists
   4. Auto-syncs `refresh_token` from server if absent but `session_id` exists

### OAuth Flow
- **Google OAuth**: `loginWithGoogle()` in `useAuthStore` redirects to `{apiUrl}/auth/google?redirect={encodedPath}`. On return, the backend redirects back with `token`, `refreshToken`, `sessionId` as URL query params, which the `useAuthSync` hook captures.
- **Google One Tap**: `GoogleOneTap` component rendered in `PublicLayout`.

### Token Refresh
- Axios response interceptor catches 401, calls `POST /auth/refresh` with stored refresh token
- If no `refresh_token` but `session_id` exists, calls `syncRefreshTokenApi(sessionId)` to retrieve it
- Singleton promise pattern prevents concurrent refresh attempts
- On final failure: calls `handleAuthFailure()` which clears all tokens and redirects to `/login`

### reCAPTCHA
- `ReCaptchaProvider` wraps the app using `react-google-recaptcha-v3`
- reCAPTCHA tokens are passed to backend exam submission endpoints

---

## 7. Providers (`src/provider/`)

| File | Order in Tree | Purpose |
|---|---|---|
| `ReCaptchaProvider.tsx` | Outermost | Google reCAPTCHA v3 |
| `ThemeProvider.tsx` | 2nd | `next-themes` wrapper with `useThemeContext()` hook exposing `isDarkMode` |
| `AppProviders.tsx` | Composes all | Wraps app in: ReCaptcha > ThemeProvider > AntdConfigProvider > ToastProvider > AuthSyncBootstrap > GoogleAnalytics |
| `AntdConfigProvider.tsx` | Inside ThemeProvider | Dynamic Ant Design theme (dark/light), custom colors (primary: `#cc785c`) |

---

## 8. Type System (`src/types/`)

| File | Key Types |
|---|---|
| `user.ts` | `User` (id, username, email, avatar, wallet balance, isAdmin, isVerified) |
| `exam.ts` | `Quizz`, `Flashcard`, `TypeResultGenerateExam` enum |
| `examSession.ts` | `ExamSession`, `EXAM_SESSION_STATUS` enum, `ASSESS_TYPE`, `QUESTION_SELECTION_MODE`, `LabelQuestionConfig`, `AccessCheckResult`, `ExamSessionPublicInfo`, `SharingSettings` |
| `examRoom.ts` | `ExamRoom`, `ExamSessionBasic` |
| `flashcardSet.ts` | `FlashcardSet`, `Flashcard`, `FlashcardStudySession`, `FlashcardSetProgress`, access/sharing types |
| `quizset.ts` | `QuizSet`, `Quizz` (with id), `QuizSetLabel`, `LastAttemptInfo` |
| `ai.ts` | `AIModel`, `AIModelCatalog` (embedding + generation models), `AIModelType`, `DEFAULT_AI_MODEL` |
| `genai-knowledge.ts` | `GenAIKnowledgeFolder`, `GenAIKnowledgeFile`, `GenAIKnowledgeGraphSnapshot`, dataset import types |

---

## 9. Component Architecture (`src/components/`)

Organized by atomic design pattern (atoms/molecules/organisms) with feature sub-directories:

### Atoms (~26 files)
- **Generic**: `GlassBackground`, `ProfileDropdown`, `ClientOnly`, `Logo`, `ModelSelector`
- **k/ (workspace)**: `ProgressCircle`, `DifficultyBadge`, `FlipCard`, `CountdownTimer`, `FloatingDock`, `UserAvatar`, `CardActionsMenu`, `SecureBadge`, `ConnectionStatus`, `NotificationBadge`, `ExamStatusBadge`, `FormSelectFlashcardSet`, `FormSelectQuizSet`, `SystemCheckItem`, etc.
- **subscription/**: `CreditPackageCard`
- **ui shims**: `not-found`, `input` (custom shim), card, button, dialog, etc.
- **antd/**: Wrapped/re-exported Ant Design components (button, dialog, select, etc.) for consistent styling
- **magicui/**: `highlighter`, `sparkles-text` (eye candy)
- **kokonutui/**: Brand logo icons (DeepSeek, Mistral, Gemini, OpenAI, Anthropic)

### Molecules (~36 files)
- **Generic**: `RichTextViewer`, `RichTextEditor`, `StandardMarkdownRenderer`, `SearchBar`, `LabelSelector`, `FilterSelect`, `HeaderSection`, `PostCard`
- **k/**: `ExamMetricCard`, `TrendingTopicItem`, `StatCard`, `HistoryStatCard`, `ExamHistoryListItem`, `PDFHistoryListItem`, `ExamRoomCardItem`, `ChatInputBar`, `ConversationItem`, `NotificationItem`, `RoomInfoRow`, `ChatHistoryCard`, `RoomStatsCard`, etc.
- **profile/**: `ProfileForm`, `DeviceList`, `ChangePasswordSection`
- **subscription/**: `UsageBreakdownCard`, `SubscriptionPlanCard`, `CreditSlider`, `TransactionHistoryTable`, `CreditStatisticsCard`

### Organisms (~56 files)
- **Generic**: `ConfirmDialog`, `DeleteConfirmDialog`, `FullscreenConfirmDialog`, `ImageUrlDialog`, `PendingJobDialog`, `TableSkeletonLoader`
- **landing/**: `HeroBand`, `FeatureGrid`, `PricingCards`, `PricingBand`, `WaysToStudy`, `TrustStrip`, `ProductShowcase`, `CoralCallout`, `LegalPageShell`
- **auth/**: `auth-layout-shell`, `signin-form`, `signup-form`
- **subscription/**: `QRPaymentDialog`
- **k/**: `SideBar`, `ExamTable`, `ExamTablePagination`, `FlashcardTable`, `FlashcardSearchFilterBar`, `FlashcardGenerator`, `TestGenerator`, `PostsList`, `ConversationList`, `NotificationList`, `NotificationFilterSidebar`, `CategoriesSidebar`, `TrendingSidebar`, `SettingsSidebar`, `ThemeSettingsSection`, `InterfaceSettingsSection`, `UpcomingExamsSection`, `RecentActivitySection`, `QuickTasksSection`, `TopContributors`, `NeedHelpSection`, etc.
- **k/genai-knowledge/**: `KnowledgeFolderList`, `KnowledgeFileGrid`, `KnowledgeUploadZone`, `KnowledgeStatsCards`, `KnowledgeFilterBar`, `KnowledgeFolderDialog`, `KnowledgeGraphDialog`, `KnowledgeDatasetImportDialog`, `KnowledgePendingUploadList`
- **Modals**: `QuizSetModal`, `FlashcardSetModal`, `ExamRoomModal`, `ExamSessionFormModal`, `ShareFlashcardModal`, `QuestionEditorDialog`, `FlashcardEditorDialog`, `FlashcardLabelManager`, `PracticeSettingsModal`, `RecentFilesModal`

### Templates (~10 files)
Page-level composition components: `HistoryTemplate`, `ExamRoomManagementTemplate`, `ExamRoomDetailTemplate`, `ExamManagementTemplate`, `ProfileTemplate`, `SettingsTemplate`, `SubscriptionTemplate`, `NotificationTemplate`, `FlashcardManagementTemplate`

These serve as the bridge between page components and organisms.

---

## 10. Hooks (`src/hooks/`)

| File | Purpose |
|---|---|
| `useAuthSync.ts` | Auth bootstrap: captures OAuth redirect params, syncs token to cookie, initializes getUser |
| `useCheatingDetection.ts` | Exam proctoring: detects tab switch, window blur, devtools, copy/paste, right-click, fullscreen exit, print screen. Logs violations to API. |
| `useDebounce.ts` | Generic debounce with configurable delay |
| `useExportPDF.ts` | Dynamic jsPDF export for quiz sets and flashcard sets |
| `useGenerationGuard.ts` | `beforeunload` guard during AI generation + visibility/network change handlers |
| `useMediaQuery.ts` | SSR-safe media query hook with Tailwind breakpoint presets (`useIsMobile`, `useIsDesktop`, etc.) |

---

## 11. Lib Utilities (`src/lib/`)

| File | Purpose |
|---|---|
| `env.ts` | Reads env vars from `import.meta.env` (Vite) or `process.env` (legacy). Keys: `apiUrl`, `recaptchaSiteKey`, `measurementId`, `quizAesKey`, `genAITutorAllowedEmails` |
| `storeCache.ts` | In-memory cache manager for Zustand stores (Map-based, TTL support) |
| `creditUtils.ts` | Credit cost calculation (OCR, generation). Has `FREE_MODE = true` flag that bypasses all balance checks. |
| `authRedirect.ts` | `setRedirectBackTarget` / `getRedirectBackTarget` / `clearRedirectBackTarget` for post-login redirect |
| `navigation.ts` | `navigateTo` wrapper around React Router |
| `crypto.ts` | AES encryption/decryption (likely for quiz answer encryption) |
| `deviceId.ts` | `getOrCreateDeviceId` -- generates/persists unique device fingerprint |
| `secureQuizHelpers.ts` | Helpers for secure quiz flow (encrypted answers with JWT) |
| `quizAnswerUtils.ts` | Quiz answer processing utilities |
| `pdfUtils.ts` | PDF-related utilities |
| `text.ts` | Text processing utilities |
| `utils.ts` | General utilities |
| `genai-knowledge-cache.ts` | Cache utilities for GenAI knowledge API calls |
| `genai-knowledge-access.ts` | Access control for GenAI knowledge manager feature |

---

## 12. Third-Party Integrations

| Library | Version | Usage |
|---|---|---|
| **React** | 19.1.0 | Framework |
| **React Router DOM** | 7.9.3 | Client-side routing |
| **Axios** | 1.12.2 | HTTP client with interceptors |
| **Zustand** | 5.0.8 | State management |
| **Ant Design (antd)** | 6.3.7 | UI component library (modals, tables, forms, selects, etc.) |
| **Tailwind CSS** | 4 | Utility CSS framework |
| **Framer Motion / Motion** | 12.23.22 | Animation library |
| **Recharts** | 3.5.1 | Charts (stats, analytics) |
| **TipTap** | 3.11.1 | Rich text editor (with image, placeholder, starter-kit) |
| **Lucide React** | 0.544.0 | Icons |
| **Tabler Icons** | 3.35.0 | Additional icons |
| **Heroicons** | 2.2.0 | Additional icons |
| **react-google-recaptcha-v3** | 1.11.0 | reCAPTCHA v3 |
| **next-themes** | 0.4.6 | Theme provider (dark/light mode) |
| **Date-fns** | 4.1.0 | Date formatting |
| **jsPDF** | 3.0.3 | Client-side PDF generation |
| **KaTeX** | 0.16.27 | Math equation rendering |
| **react-markdown** | 10.1.0 | Markdown rendering |
| **Crypto-JS** | 4.2.0 | AES encryption (quiz answer security) |
| **Cobe** | 0.6.5 | Globe visualization |
| **Three.js** | 0.180.0 | 3D rendering (globe) |
| **Facehash** | 0.1.0 | Avatar generation from user identity |
| **Driver.js** | 1.4.0 | Product tour / onboarding |
| **Clsx** | 2.1.1 | Class name utility |
| **Tailwind Merge** | 3.3.1 | Tailwind class deduplication |
| **Input OTP** | 1.4.2 | OTP input for verification |
| **Rough Notation** | 0.5.1 | Hand-drawn annotation effects |

---

## 13. Key UI Patterns

1. **Landing page sections**: Modular "Band" pattern (`HeroBand`, `FeatureGrid`, `PricingBand`, etc.) -- all under `components/organisms/landing/`
2. **Workspace sidebar**: `SidebarKit` with navigation items, user profile dropdown, floating dock (mobile). Collapsible via sidebar_collapsed in localStorage.
3. **CRUD modals**: Consistent pattern of `{Entity}Modal` + `{Entity}Form` for creation/editing (QuizSet, FlashcardSet, ExamRoom, ExamSession)
4. **AI Generation flow**: File upload -> job queue -> polling -> display results. Handled by `useAIGeneratorStore` (3 sub-stores + shared job store)
5. **AI Teacher chat**: SSE streaming with `aiChatApi.streamMessage()`, TTS via proxy API, file attachments, subject selection
6. **Exam taking**: Secure quiz flow with encrypted questions (`/secure-quiz`), JWT token per question, anti-cheating detection, fullscreen enforcement
7. **QR payments**: `QRPaymentDialog` shows QR code for bank transfer. Payment status polling.
8. **History pages**: Template-based layout with stats grid, PDF history list, exam history list, recent activity

---

## 14. Unresolved Questions / Notes for Wave 0

1. The `TeacherRoute.tsx` guard does NOT actually check for teacher/admin role -- it checks `isAuthenticated` only (same as `ProtectedRoute`). The `isAdmin` field exists on User but is unused in route guards.
2. `FREE_MODE = true` in `creditUtils.ts` -- hardcoded to bypass all credit checks. Intended for development but may need attention in production.
3. The app has remnants of Next.js (`next.config.ts`, `next-env.d.ts`, `next-themes`, `app/` directory) suggesting a migration from Next.js to Vite+React Router.
4. Some API endpoints reference `/api/v1` prefixes (exam-service) while others don't -- the proxy configuration in `nginx.conf` and `vite.config.ts` should be verified.
5. The `useStatsStore` uses raw `fetch()` instead of the Axios instance, bypassing auth interceptors. Uses `credentials: "include"` instead.
6. Secure quiz flow uses AES encryption (`crypto-js`) with a key from env var `VITE_QUIZ_AES_KEY`. Default fallback is `"default-aes-256-key-32-chars!!!"` in `env.ts`.
7. PDF upload has a 50MB limit enforced client-side.
8. The store naming convention is inconsistent: some use `use*Store` pattern, others use `use*Store` with different camelCase (e.g., `useTestGeneratorStore`, `useJobStore` defined in same file).
9. `GoogleOneTap` component exists but its API (Google Identity Services) may require separate client ID configuration.
10. The `AutoJoinByLink` feature on exam sessions suggests a shareable link flow that bypasses auth checks.

---

*Report generated from source code analysis of `/Users/tgiap.dev/devs/examio/examio-fe/src/` -- 180+ source files examined.*
