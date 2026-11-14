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
| FLW103 | Google OAuth | SCR102 -> system browser -> `kmaedu://auth/callback` -> SCR106 | API-backed auth. |
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
| FLW203 | Google OAuth | SCR202 -> system browser -> `kmaedu://auth/callback` -> SCR206 | API-backed auth with Keychain persistence. |
| FLW204 | Launch authenticated | AuthViewModel token restore Needs verification -> SCR206 | Token persistence exists; restore semantics Need verification. |
| FLW205 | Main tab navigation | SCR206 -> SCR207-SCR212 | Feature screens mock-backed. |
| FLW206 | AI/study/exam/account/teacher actions | SCR208-SCR212 local state only | Mock-backed UI; shared KMP APIs not generally used by iOS screens except auth has private URLSession client. |

## Cross-Platform Parity Notes

- Web is the most complete API-backed client.
- Mobile auth is API-backed on both platforms.
- Mobile Android/iOS feature screens for AI, study, exams, history, account, and teacher are mostly mock-backed; shared KMP repositories exist but are not wired into platform UI.
- Mobile SSE streaming is not functional: shared platform implementations throw `NotImplementedError`.
