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
