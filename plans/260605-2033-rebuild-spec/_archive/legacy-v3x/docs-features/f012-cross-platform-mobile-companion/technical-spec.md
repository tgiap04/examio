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
