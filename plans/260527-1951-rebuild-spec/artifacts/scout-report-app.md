# Mobile App Codebase Scout Report

**Date:** 2026-05-27
**Project:** Examio KMP Mobile App
**Root:** `/Users/tgiap.dev/devs/examio/examio-app/`

## 1. Project Overview

This is a **Kotlin Multiplatform (KMP)** mobile application with **Android (Jetpack Compose)** and **iOS (SwiftUI)** frontends sharing Kotlin common code. It serves as the mobile companion to the Examio exam/learning platform, featuring AI question generation from PDFs, flashcard study, exam rooms, and account/wallet management.

**Architecture Pattern:** Simple app-level architecture (not full Clean Architecture). Features are organized by domain folders. Data flow is: **View -> UiState (local) -> Repository (shared) -> ApiService (shared Ktor) -> Backend**. There are no ViewModel classes in the shared module -- each platform manages its own UI state locally.

**State Management:**
- Android: `remember { mutableStateOf(...) }` with `copy()` for immutable state updates (no ViewModel / StateFlow for screens, no shared ViewModels).
- iOS: `@State` with local struct states, plus `@StateObject AuthViewModel` for auth (using `@Published` properties).
- Shared: `LoadableState<T>` sealed interface for async data (Idle/Loading/Empty/Data/Error), `ApiResult<T>` for API responses.

**Navigation Library:**
- Android: Custom `AuthNavGraph` composable for auth flow (enum-based screen switching), main content uses `Scaffold` + `BottomTabBar` with `when(selectedTab)`.
- iOS: `NavigationStack` with `switch(route)` for auth, `TabView` with tab selection for main content. Simple enum-based navigation, no NavigationStack path-based routing for the main tabs.
- Neither platform uses a navigation library (no Jetpack Navigation Compose, no NavigationStack path navigation).

**API Client Library:** **Ktor** (shared multiplatform HTTP client) with:
- Ktor CIO engine on Android (via `ktor-client-okhttp`), Darwin engine on iOS (via `ktor-client-darwin`)
- Content negotiation with `kotlinx.serialization.json`
- `AuthInterceptor` plugin for automatic bearer token injection
- `safeApiCall<T>` / `safeUnitApiCall` helper functions wrapping calls in try/catch and returning `ApiResult<T>`

**Backend API Base URL:** `http://10.0.2.2:3000` (Android emulator localhost) / `http://localhost:3000` (iOS simulator), configurable via `BuildConfig` (Android) or `Info.plist` key `ExamioAPIBaseURL`.

---

## 2. Build Configuration

### Root `build.gradle.kts`
- Applies plugins: `android.application`, `android.library`, `kotlin.android`, `kotlin.multiplatform`, `kotlin.compose`, `kotlin.serialization` (all via version catalog `libs`)

### `settings.gradle.kts`
- Root project: `ExamioApp`
- Modules: `:androidApp`, `:shared`
- Uses version catalog (`libs`)

### `shared/build.gradle.kts`
- KMP targets: `androidTarget()`, `iosX64()`, `iosArm64()`, `iosSimulatorArm64()`
- Shared framework is **static** (`baseName = "Shared", isStatic = true`)
- Common dependencies: `ktor-client-core`, `ktor-client-content-negotiation`, `ktor-client-logging`, `ktor-serialization-kotlinx-json`, `kotlinx-serialization-json`
- Android-specific: `ktor-client-okhttp`
- iOS-specific: `ktor-client-darwin`
- Min SDK: from version catalog
- Namespace: `com.examio.app.shared`

### `androidApp/build.gradle.kts`
- Application ID: `com.examio.app`
- Compile SDK: from version catalog, Min SDK: from version catalog, Target SDK: from version catalog
- Version: `0.1.0` (versionCode 1)
- `API_BASE_URL` build config field: `"http://10.0.2.2:3000"` (emulator localhost)
- BuildConfig enabled
- Dependencies: `shared` module, `androidx.activity.compose`, Compose BOM, `material3`, `material.icons.extended`

---

## 3. Shared Module (`shared/src/`)

### 3.1 Common Main (`shared/src/commonMain/`)

#### Core Layer

| File | Description |
|------|-------------|
| `core/config/AppConfig.kt` | Data class holding `apiBaseUrl` and `environmentName` |
| `core/network/HttpClientFactory.kt` | Creates Ktor `HttpClient` with content negotiation (JSON), timeouts (30s req, 15s connect), logging, and auth interceptor |
| `core/network/AuthInterceptor.kt` | Ktor `HttpSend` plugin interceptor that injects `Bearer` token and `X-Device-ID` header from `SecureTokenStorage` |
| `core/network/ApiEndpoints.kt` | All REST endpoint path constants (`/auth/login`, `/auth/me`, `/profile`, `/wallet/details`, `/flashcardsets`, `/quizsets`, `/examrooms`, `/examsessions`, `/examattempts`, `/ai`, `/subjects`) |
| `core/network/ApiResult.kt` | Sealed interface: `Success<T>`, `HttpError(statusCode, message)`, `NetworkError(message)` |
| `core/network/ApiCall.kt` | `safeApiCall<T>` and `safeUnitApiCall` inline functions wrapping Ktor calls with error handling |
| `core/network/PaginatedResponse.kt` | `@Serializable` generic paginated response (`data`, `total`, `page`, `limit`, `totalPages`) |
| `core/network/SSEClient.kt` | Interface for SSE streaming (`stream(url, headers, onEvent)`); platform `expect`/`actual` |
| `core/storage/SecureTokenStorage.kt` | Interface with `readTokens()`, `saveTokens()`, `clearTokens()`; `expect fun createSecureTokenStorage()` |
| `core/session/SessionModels.kt` | `SessionTokens` (accessToken, refreshToken, sessionId, deviceId), `UserSession` (userId, email, displayName, roles) |
| `core/ui/LoadableState.kt` | Sealed interface: `Idle`, `Loading`, `Empty`, `Data<T>`, `Error(message)` |

#### Navigation Models

| File | Description |
|------|-------------|
| `features/navigation/MainTab.kt` | Enum: `AiTool` ("AI"), `TaiLieu` ("Tai lieu"), `BaiThi` ("Bai thi"), `DeThi` ("De thi"), `LichSu` ("Lich su") |
| `features/navigation/AuthState.kt` | `NavigationAuthState` (Loading/Unauthenticated/Authenticated), `UserSession`, `UserRole` (Student/Teacher/Admin) |
| `features/navigation/DeepLink.kt` | `DeepLink` sealed interface (`ExamSession`, `Flashcard`, `Chat`, `Profile`) with `parseDeepLink()` and `targetTab()` |

#### Auth Feature

| File | Description |
|------|-------------|
| `features/auth/models/AuthModels.kt` | Request/response types: `LoginRequest`, `SignupRequest`, `AuthResponse`, `CurrentUserResponse`, `ForgotPasswordRequest`, `ResetPasswordRequest`, `RefreshTokenRequest`, `MessageResponse` |
| `features/auth/models/UserModels.kt` | `User` model (id, email, username, name, avatar, banner, bio, isVerified, roles, createdAt, updatedAt), `UserRole` enum (Student/Teacher/Admin) |
| `features/auth/api/AuthApiService.kt` | API methods: login, signup, currentUser, refresh, logout, forgotPassword, resetPassword |
| `features/auth/repository/AuthRepository.kt` | Orchestrates auth: `restoreSession()` with token refresh fallback, login/signup/logout with token persistence, OAuth token saving |

#### AI Feature

| File | Description |
|------|-------------|
| `features/ai/models/AIChatModels.kt` | `AIChat`, `AIChatMessage` (id, chatId, role, content), `SendMessageRequest` |
| `features/ai/models/SubjectModels.kt` | `SubjectCategory` (id, name, description, icon), `Subject` (id, name, slug, description, categoryId) |
| `features/ai/models/AIGeneratorModels.kt` | `RecentUpload`, `GenerateExamRequest` (uploadId, questionCount, difficulty), `GenerateExamResponse` |
| `features/ai/api/AIChatApiService.kt` | List chats, get messages, send message (`/ai/chats`, `/ai/chat`) |
| `features/ai/api/SubjectApiService.kt` | Categories, subjects list, single subject (`/subjects`) |
| `features/ai/api/AIGeneratorApiService.kt` | Recent uploads, generate exam from file (`/ai/recent-uploads`, `/ai/generate-from-file`) |
| `features/ai/repository/AIChatRepository.kt` | Aggregates chat, generator, subject APIs + SSE client for streaming |

#### Study Feature

| File | Description |
|------|-------------|
| `features/study/models/FlashcardModels.kt` | `FlashcardSet`, `Flashcard` (id, question, answer, image), `CreateFlashcardSetRequest`, `FlashcardSetLabel` |
| `features/study/models/FlashcardStudyModels.kt` | `FlashcardStudyState` (setId, currentIndex, isAnswerVisible, masteredCardIds) |
| `features/study/api/FlashcardApiService.kt` | CRUD for flashcard sets + get flashcards within a set (`/flashcardsets`) |
| `features/study/api/StudentMaterialsApiService.kt` | Recent flashcards, recent exams, toggle pin (`/student/materials/`) |
| `features/study/repository/FlashcardRepository.kt` | Aggregates flashcard and materials APIs |

#### Exams Feature

| File | Description |
|------|-------------|
| `features/exams/models/QuizSetModels.kt` | `QuizSet`, `Question`, `CreateQuizSetRequest`, `QuizSetLabel` |
| `features/exams/models/ExamRoomModels.kt` | `ExamRoom`, `ExamSession`, `ExamSessionStatus` (Draft/Scheduled/Active/Completed/Cancelled) |
| `features/exams/models/ExamAttemptModels.kt` | `ExamAttempt`, `StartExamAttemptRequest`, `SecureQuestion` (encrypted), `SecureQuizResponse`, `SecureAnswer`, `SubmitExamAttemptRequest` |
| `features/exams/api/QuizSetApiService.kt` | Full CRUD for quiz sets + questions (`/quizsets`) |
| `features/exams/api/ExamRoomApiService.kt` | List exam rooms, get detail, list sessions (`/examrooms`) |
| `features/exams/api/ExamAttemptApiService.kt` | Start attempt, list attempts, get secure quiz, submit attempt (`/examattempts`) |
| `features/exams/repository/ExamRepository.kt` | Aggregates quiz set, exam room, and exam attempt APIs |

#### History Feature

| File | Description |
|------|-------------|
| `features/history/models/HistoryModels.kt` | `HistoryStats` (totalPdfs, totalExams, totalFlashcards, completedAttempts), `PDFHistoryItem`, `ExamHistoryItem` |
| `features/history/api/HistoryApiService.kt` | Stats, PDF history, exam history (`/examattempts/history-stats`, `/ai/recent-uploads`, `/examattempts/list`) |

#### Account Feature

| File | Description |
|------|-------------|
| `features/account/models/ProfileModels.kt` | `UserProfile`, `UpdateProfileData` |
| `features/account/models/WalletModels.kt` | `Transaction`, `WalletDetails` (balance + transactions), `SubscriptionPlan` |
| `features/account/api/ProfileApiService.kt` | Get/update profile (`/profile`) |
| `features/account/api/WalletApiService.kt` | Wallet details, subscription plans (`/wallet/details`, `/payment/subscription/plans`) |
| `features/account/repository/AccountRepository.kt` | Aggregates profile and wallet APIs |

### 3.2 Android Main (`shared/src/androidMain/`)

| File | Description |
|------|-------------|
| `core/storage/SecureTokenStorage.android.kt` | `actual fun createSecureTokenStorage()`, uses Android SharedPreferences + AES/GCM encryption via Android KeyStore (key alias `examio_mobile_session`); initialized via `initSecureTokenStorage(context)` |
| `core/network/SSEClient.kt` | `actual fun createSSEClient()`, currently throws `NotImplementedError("SSE streaming is wired in Phase 6")` |

### 3.3 iOS Main (`shared/src/iosMain/`)

| File | Description |
|------|-------------|
| `core/storage/SecureTokenStorage.ios.kt` | `actual fun createSecureTokenStorage()`, currently returns `null` from `readTokens()` and throws `NotImplementedError` from `saveTokens()` -- **NOT YET IMPLEMENTED** |
| `core/network/SSEClient.kt` | Same `NotImplementedError` as Android -- not yet wired |

---

## 4. Android App (`androidApp/`)

### 4.1 Core Android Files

| File | Description |
|------|-------------|
| `AndroidManifest.xml` | Single activity (`MainActivity`), `launchMode="singleTop"`, deep link intent filter for `examio://auth` |
| `MainActivity.kt` | Entry point; sets up edge-to-edge, initializes secure token storage, creates `AndroidAppContainer`, handles OAuth callback URI (`examio://auth`), renders `ExamioTheme { ExamioApp(...) }` |
| `ExamioApp.kt` | Root composable; manages auth state (mut state); shows `AuthNavGraph` when unauthenticated, `Scaffold` + top bar + bottom tab bar + content `when(selectedTab)` when authenticated |
| `OAuthCallbackHolder.kt` | Singleton `StateFlow<String?>` to pass OAuth callback URIs between Activity and Compose tree |
| `design/ExamioTheme.kt` | Material 3 `lightColorScheme` with primary `#CC785C` (coral), background `#FAF9F5`, surface variant `#EFE9DE` |

### 4.2 Backend / DI

| File | Description |
|------|-------------|
| `backend/AndroidAppContainer.kt` | Manual DI container: creates `HttpClient` via `HttpClientFactory.create()`, instantiates `AuthRepository` with `AuthApiService` |
| `backend/AndroidSecureTokenStorage.kt` | Unused? (Duplicates `shared/src/androidMain/` implementation -- also AES/GCM with Android KeyStore) |
| `core/config/MobileApiConfig.kt` | Builds API base URL from `BuildConfig.API_BASE_URL` + `/api/v1`, provides `googleOAuthUrl()` with `examio://auth/callback` redirect |

### 4.3 Navigation

| File | Description |
|------|-------------|
| `navigation/BottomTabBar.kt` | Material 3 `NavigationBar` with 5 tabs (AI, Tai lieu, Bai thi, De thi, Lich su) and coral accent color |
| `navigation/AppHeader.kt` | `TopAppBar` with logo image and profile icon button |

### 4.4 Feature Screens

#### Auth

| File | Description |
|------|-------------|
| `features/auth/AuthNavGraph.kt` | Auth screen router: Login/Register/ForgotPassword/ResetPassword navigation via enum, OAuth callback processing, form validation |
| `features/auth/AuthState.kt` | `AuthScreen` enum, `AuthUiState` (isAuthenticated, isLoading, errorMessage, successMessage), `toAuthMessage()` |
| `features/auth/LoginScreen.kt` | Login form: credential + password inputs, Google OAuth button, validation, error/success display |
| `features/auth/RegisterScreen.kt` | Register form: username + email + password + confirm password |
| `features/auth/ForgotPasswordScreen.kt` | Email input for sending reset code |
| `features/auth/ResetPasswordScreen.kt` | Code + new password input |
| `features/auth/AuthCardShell.kt` | Shared card-based layout with gradient background for auth screens |
| `features/auth/AuthFormComponents.kt` | Reusable `AuthTextField`, `AuthPrimaryButton`, `AuthSocialButton`, `AuthMessage` |

#### Home (Note: HomeScreen is defined but NOT used in ExamioApp.kt -- `selectedTab` defaults to `AiTool`)

| File | Description |
|------|-------------|
| `features/home/HomeScreen.kt` | Dashboard with stats grid (2x2), recent flashcards, recent exams sections |
| `features/home/HomeDashboardModels.kt` | `HomeDashboardState`, `HomeStat`, `HomeRecentFlashcard`, `HomeRecentExam` |
| `features/home/StatsCard.kt` | Individual stat card composable |
| `features/home/RecentItems.kt` | Recent flashcard/exam row composables |

#### AI

| File | Description |
|------|-------------|
| `features/ai/AiScreen.kt` | AI tab with 3 sub-sections (Teacher chat, Tool generate, History), uses `FilterChip` for section switching |
| `features/ai/AIToolScreen.kt` | PDF upload zone, question type filters ("Trac nghiem", "Dien tu", "Dung/Sai", etc), count/keyword inputs, preview |
| `features/ai/AiModels.kt` | `AiUiState`, `AiSection` enum, `AiChatMessage`, `AiHistoryItem` |

#### Exams

| File | Description |
|------|-------------|
| `features/exams/MyExamsScreen.kt` | 4 states: list view, session detail view, quiz-taking view (with progress + radio buttons), result view |
| `features/exams/MyExamsModels.kt` | `MyExamsUiState`, `ExamAttempt`, `ExamQuestion`, `ExamStatus` |
| `features/exams/DeThiScreen.kt` | Exam sets management: stats cards, Flash Card / Phong thi buttons, exam set list, FAB for create |

#### Study

| File | Description |
|------|-------------|
| `features/study/StudyScreen.kt` | Two states: material list (with pin toggle) + flashcard study (front/back flip, prev/next, progress bar) |
| `features/study/StudyModels.kt` | `StudyUiState`, `StudyMaterial`, `StudyFlashcard` |

#### History

| File | Description |
|------|-------------|
| `features/history/LichSuScreen.kt` | Stats cards (PDF/Bai thi/Flashcards/Tu hoc) + recent activity list |

#### Account

| File | Description |
|------|-------------|
| `features/account/AccountScreen.kt` | 4 sections via `FilterChip`: Profile, Wallet, Teacher, Settings |
| `features/account/AccountModels.kt` | `AccountUiState`, `AccountSection` enum, `TransactionItem` |
| `features/account/ProfileSheet.kt` | `ModalBottomSheet` for profile: wallet entry, change password, logout |

#### Teacher

| File | Description |
|------|-------------|
| `features/teacher/TeacherScreen.kt` | Teacher content management: segmented picker (Flashcard/Quiz/Phong thi), create button, item list |
| `features/teacher/TeacherModels.kt` | `TeacherUiState`, `TeacherContentType`, `TeacherContentItem` |

---

## 5. iOS App (`iosApp/`)

### 5.1 Core iOS Files

| File | Description |
|------|-------------|
| `ExamioApp.swift` | `@main` SwiftUI App struct, renders `ContentView()` in `WindowGroup` |
| `ContentView.swift` | Root view: shows `AuthFlowView` if not authenticated, tabbed main content (`TabView` with 5 tabs + `AppHeader` + `ProfileSheet` sheet) if authenticated; handles `onOpenURL` for deep links |
| `AppConfig.swift` | API config: reads `ExamioAPIBaseURL` from `Info.plist` (default `http://localhost:3000`), builds `apiBaseURL` with `/api/v1` prefix, provides `googleOAuthURL()` |
| `AppRouter.swift` | `AppDeepLink` enum (`examSession`, `flashcard`, `chat`, `profile`) + `AppTab` enum + `parseAppDeepLink()` function |
| `Info.plist` | App version `0.1.0`, custom URL scheme `examio`, `ExamioAPIBaseURL` default `http://localhost:3000` |

### 5.2 Auth

| File | Description |
|------|-------------|
| `Features/Auth/AuthViewModel.swift` | `@MainActor final class ObservableObject` with `@Published` auth state; login/register/sendResetCode/resetPassword methods calling private `AuthApiClient` (URLSession-based), private `KeychainTokenStore` for token persistence; OAuth callback handling via `completeOAuthCallback(url:)` |
| `Features/Auth/AuthFlowView.swift` | `NavigationStack` with `switch(route)` routing Login/Register/ForgotPassword/ResetPassword; `onOpenURL` handler for OAuth |
| `Features/Auth/LoginView.swift` | Login UI: branded gradient background, circular decorative blobs, card-based form, credential + password fields, Google OAuth button via `openURL(AppConfig.googleOAuthURL())`, error/success messages |
| `Features/Auth/RegisterView.swift` | Registration form with name/email/password/confirm fields |
| `Features/Auth/ForgotPasswordView.swift` | Email input for reset code |
| `Features/Auth/ResetPasswordView.swift` | Code + new password input |
| `Features/Auth/AuthComponents.swift` | `AuthMessageView` shared component |

### 5.3 Feature Views

| File | Description |
|------|-------------|
| `Views/HomeView.swift` | Dashboard with stats grid (empty state: all zeros), recent flashcards, recent exams sections |
| `Views/AiView.swift` | 3-section AI view (Teacher chat / Tool / History) via segmented picker; chat bubble UI, PDF generation tool UI, history list |
| `Views/StudyView.swift` | Material list view with flashcard set rows + flashcard study view with flip card animation (tap to reveal answer) |
| `Views/MyExamsView.swift` | Exam attempts list, session detail, quiz-taking (progress bar, question card, prev/next/submit), result view |
| `Views/AccountView.swift` | 4-section segmented picker: Profile, Wallet, Teacher, Settings |
| `Views/TeacherView.swift` | Teacher content management with segmented picker (Flashcard/Quiz/Phong thi) |
| `Views/PlaceholderScreen.swift` | Generic placeholder view |

---

## 6. Auth Flow Details

### Android
1. `MainActivity.onCreate()` checks `intent.data` for `examio://auth` scheme -- stores in `OAuthCallbackHolder`
2. `ExamioApp` renders `AuthNavGraph` when `authState == Unauthenticated`
3. `AuthNavGraph` uses `LaunchedEffect` to observe `OAuthCallbackHolder.callback` flow
4. Login: validates -> calls `authRepository.login(credential, password)` -> Ktor POST `/auth/login` -> `AuthResponse` contains tokens -> `persistTokens()` saves via `AndroidSecureTokenStorage` (AES/GCM/KeyStore) -> `onAuthenticated(user)` -> app switches to main content
5. Google OAuth: opens URL `{apiBaseUrl}/auth/google?redirect=examio://auth/callback` -> system browser -> callback intercepted by `MainActivity.onNewIntent()` -> `AuthNavGraph` parses `token`/`refreshToken` from callback URI query params -> `authRepository.saveOAuthTokens()`

### iOS
1. `AuthFlowView` in `ContentView` shows unauthenticated flow
2. `AuthViewModel` handles all auth logic (private `AuthApiClient` using `URLSession`, private `KeychainTokenStore` for Keychain persistence)
3. Login/Register call `AuthApiClient` methods -> save tokens via Keychain (service: `examio.session`) -> set `isAuthenticated = true`
4. Google OAuth: `LoginView` calls `openURL(AppConfig.googleOAuthURL())` -> system browser -> callback via `onOpenURL` in `AuthFlowView` -> routes to `AuthViewModel.completeOAuthCallback(url:)` -> parses token from query params -> saves via Keychain
5. **Keychain token store** stores accessToken, refreshToken, sessionId, deviceId per account

### Token Refresh (Shared)
- `AuthRepository.restoreSession()` handles the refresh flow: reads stored tokens -> calls `currentUser()` -> if fails, calls `refresh(refreshToken)` -> on success, persists new tokens -> retries `currentUser()`
- On 401/403 errors, tokens are cleared

---

## 7. Key Observations

### What is Real vs. Mock Data
- **Shared module (commonMain):** All API services, models, and repositories are real and fully wired to the Ktor `HttpClient`. The `ExamRepository`, `AIChatRepository`, `FlashcardRepository`, `AuthRepository`, `AccountRepository` are production-ready facades.
- **Platform UI (Android + iOS):** Most screens currently use **hardcoded mock data** via local UiState objects with sample arrays. The UI infrastructure is laid out but not yet connected to repositories.
- **SSE Client:** Both platforms have stub `NotImplementedError` implementations.
- **iOS SecureTokenStorage (KMP):** Stub that returns `null` and throws `NotImplementedError`. The actual iOS Keychain token store lives in `AuthViewModel.swift` as a private class.

### Feature Completeness per Platform

| Feature | Android (Compose) | iOS (SwiftUI) | Shared API |
|---------|:-:|:-:|:-:|
| Login/Register | Full UI + auth flow | Full UI + auth flow | Complete |
| OAuth Google | Full flow | Full flow | Complete |
| Forgot/Reset Password | Full UI | Full UI | Complete |
| Home Dashboard | Full UI (unused) | Full UI | Not wired |
| AI Chat | Full UI (mock) | Full UI (mock) | Ready |
| AI Tool (PDF gen) | Full UI (mock) | Full UI (mock) | Ready |
| Flashcard Study | Full UI (mock) | Full UI (mock) | Ready |
| My Exams (attempts) | Full UI (mock) | Full UI (mock) | Ready |
| De Thi (exam sets) | Full UI (mock) | Full UI (mock) | Ready |
| History | Full UI (mock) | Full UI (mock) | Ready |
| Account Profile | Full UI | Full UI | Ready |
| Account Wallet | Full UI | Full UI | Ready |
| Teacher Management | Full UI | Full UI | Not wired |
| SSE Streaming | Stub | Stub | Interface ready |

### Duplication / Inconsistencies
1. `AndroidSecureTokenStorage` exists in **two places**: `androidApp/.../backend/` and `shared/src/androidMain/.../storage/`. Both use AES/GCM with Android KeyStore -- the shared module version is the one actually used (via `expect`/`actual`).
2. iOS has **two** token storage mechanisms: the stub KMP `IosSecureTokenStorage` (shared/iosMain) and the real `KeychainTokenStore` (embedded in `AuthViewModel.swift`). The real one is a private class, not accessible from shared code.
3. `HomeScreen` is built on Android but **not wired into navigation** -- the default tab is `AiTool`.
4. No shared ViewModels -- each platform manages its own state for every screen.
5. No DI framework -- manual constructor injection via `AndroidAppContainer` (Android) and direct instantiation (iOS).

### Unanswered Questions
1. Is a DI framework (Koin/Kodein) planned for the shared module?
2. Will iOS use KMP-generated framework classes for the API layer across all features (it currently uses a private `AuthApiClient` / `URLSession` directly in `AuthViewModel.swift` instead of the shared Ktor client)?
3. When will SSE streaming be wired (referenced as "Phase 6" in stubs)?
4. Are the mock data states in UiState objects intentionally designed to be replaced by repository calls (e.g., via `LoadableState`), or is this a V1 pattern?
5. The SecureQuiz feature includes encrypted payloads (`encryptedPayload` + `iv`) -- is client-side decryption planned?
6. No tests exist in the codebase -- what is the testing strategy?
