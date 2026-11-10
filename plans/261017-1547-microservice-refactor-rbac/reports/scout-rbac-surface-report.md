# Scout — RBAC Surface (2026-10-17)

Roots: `BE`=`kmaedu-be`, `FE`=`kmaedu-fe`, `ES`=`BE/apps/exam-service/src/modules`. All routes under `/api/v1`.
Codes: **S** STUDENT-allowed · **T** TEACHER-only · **A** SYSTEM_ADMIN · **P** public · **U** any authenticated.

## Summary
- Backend has NO role layer today: every protected route = `AuthGuard` (or `AdminGuard`); access decided only by ownership + sharing (public/whitelist/code) in services. Re-adding roles = add a guard layer; nothing to undo.
- Previous plans (`plans/260513-1957-unify-backend-role-access/`, `plans/260513-2045-remove-user-role/`) removed `User.role` (default "student"), `RolesGuard`, `@Roles(...)`. Old gates: `@Roles('teacher')` on quizset/flashcardset/examroom CUD + most AI; `@Roles('student')` on AI chat/tutor. Login used to redirect by role; now everything → `/k` → `/k/ai-tool`.
- `AuthGuard` (`BE/libs/common/src/guard/auth.guard.ts:57-80`) puts `{id, username, email, isAdmin, isVerified, isBanned, ...}` on `req.user`; rejects banned/deleted/unverified. Side bug: unverified users cannot reach `/auth/sendVerificationEmail`, `/auth/verifyAccount`, `/auth/me` (rejected by the same guard).
- Gateway `PageEnabledGuard` on AI/flashcardset/quizset/examroom/study-room/word-family proxies; `AuthGuard` only on ai + ai-chat proxies (`ai-study-proxy.controller.ts:42,372`).

## 1. Endpoint → permission inventory

### exam-service
**ai-chat** (`ES/ai-chat/ai-chat.controller.ts`, class AuthGuard `:27`; owner check `ai-chat.service.ts:568-574`) → ALL **T**. Gap: `GET :chatId/exists` no ownership (`ai-chat.service.ts:153`). Limits `checkLimits` (`:684-720`).

**ai** (`ES/ai/ai.controller.ts`) → ALL **T**: quick-upload (quota `ai.service.ts:246`, 5 credits `:375`), generate-from-file (quota `:447`, credits `:467-491`), recent-uploads, models, upload/:id GET/DELETE, upload/:id/history, upload (quota `:1009`, credits `:1019`), upload-image, regenerate/:id (`:1141`), job/:id GET/DELETE.

**cheatinglog**: POST / **S** (attempt owner `cheatinglog.service.ts:37`); GET attempt/:id, session/:id/stats, session/:sid/user/:uid **T** (host `:96,:123,:155`).

**examattempt** (all Auth; service lines):
| Route | Perm | Check |
|---|---|---|
| GET history-stats | S | own `:1572-1580` |
| POST start | S | `assertSessionAccess` `:52-91` (PUBLIC→host→whitelist→code); time window ~`:129-143`; retake `:183-200` |
| PUT :id/progress, POST :id/submit, GET :id/quiz, GET :id/secure-quiz, POST :id/secure-submit | S | own `:331,:376,:510,:1618,:1734` |
| GET list-by-room/:roomId, list-by-session/:sid | T | host `:629,:954` |
| GET :id/detail, GET get-by-id/:id, PUT :id | S/T | owner or host `:850,866,1293,1462-1496` |
| POST / | S | `:1178-1203` |
| GET list | S | `:1363-1379` |
| DELETE :id | T | host `:1338` |

**examroom** (`examroom.service.ts`): POST/GET detail/list/list-all/PUT/DELETE/GET :id/sessions → **T** (host/quizSet owner `:33,84,156,212,254,263,112,328`). `GET get-public/:id` (`ctrl:135`) **no access check, leaks host.email** (`:126-150`).

**examsession** (`examsession.service.ts`):
| Route | Perm | Check |
|---|---|---|
| POST, GET get-by-id, PUT, DELETE, GET list, GET/PUT :id/sharing, POST :id/generate-code, GET room/:roomId/available-labels | T | host `:39,146,285,166,221,769,707,1129` |
| GET get-public/:id, GET study/:id/info | P | `:209`, `:637` |
| GET study/:id/access | P/S | `checkAccess` `:421-478` (public `:442`, owner `:450`, whitelist `:458`, code `:466`) |
| GET study/:id | S | `:506-576` (answers stripped only top-level `:554-570`) |
| POST study/:id/verify-code, with-code | P/S | `:483`, `:581` no auth |
| GET users/search | T | any user can search, returns emails `:801` |
| GET study/:id/stats | S | `:847-862` |
Gap: `generate-code` (`ctrl:264-284`) wipes whitelist + forces private.

**flashcard-study** (class Auth): POST/GET progress/:setId **S**, but NO access check on the set (`flashcard-study.service.ts:66-101`). FE calls `/flashcard-study/session*` which has no backend (dead; gateway proxies `ai-study-proxy.controller.ts:626-770`).

**flashcardset** (`flashcardset.service.ts`):
| Route | Perm | Check |
|---|---|---|
| POST, GET stats, GET list, GET :id, GET :id/flashcards, PUT, DELETE, labels CRUD (`ctrl:327-470`), cards CRUD, set-flashcards-to-flashcardset, save-history-to-flashcardset, GET/PUT :id/sharing, POST :id/generate-code, GET users/search | T | owner (`:132,175,236,300,1373,1328,1413,1458+`) |
| POST :id/share | T | owner OR anyone if public (`:1749`) — fix to owner-only |
| GET public/:id, GET study/:id/info, POST study/:id/verify-code | P | `:261`, `:1279-1316`, `:1114` |
| GET study/:id/access | P/S | `checkAccess` `:1056-1108` (public `:1072`, owner `:1080`, whitelist `:1088`, code `:1096`) |
| GET study/:id, POST study/:id/with-code | S | `:1140-1205`, `:1212` (code not remembered → not added to whitelist) |

**quizset** (all owner-scoped `where {id,userId}`, `quizset.service.ts:127,174,227,275,344,378,944,1003,1065,1108…`): all CRUD/questions/labels/set-quizzes/save-history → **T**. `GET public/:id` (`ctrl:256`, service `:245-270`) **anonymous, returns answers**.

**r2**: POST /r2/image → **T** (content images; avatars via auth-service).

**student** (`student.service.ts`): GET recent-flashcards **S** (`:11-17` lists every public set globally), GET recent-exams **S** (`:167`), POST pin-flashcard/:id **S** no access check (`:106`), POST pin-exam-room/:id **S** no access check (`:135`).

**study-room** (`study-room.service.ts`): POST /studyrooms **T** (no check today); GET mine, POST join (code `:113`), POST :id/join (`applyJoin :131-160`: isActive, banned, accessType PUBLIC/WHITELIST `:144-153`, CODE `:124-126`, max `:156`), GET :id (member `:86-90`), POST :id/leave, GET :id/leaderboard → **S**; PUT/DELETE/:id/regenerate-code → **T** (room HOST `:94,105,179`). WS in-room HOST/COHOST via `StudyRoomMember.role` (room-level, not user role).

**subject**: GET categories, /, :id, slug/:slug → **P**.

**word-family**: GET categories, categories/:slug/roots, category/:cat/:root, generation-status/*, POST save, GET saved, DELETE saved/:id → **S**; categories CUD (Auth+Adm) → **A**; POST generate, generate-root → **T** (AI call, NO credit/quota check `word-family.service.ts:169-230,263-340`); POST :id/to-flashcard → **T** (creates FlashCardSet; FE `useWordFamilyStore.ts:13`).

### auth-service (`apps/auth-service/src/auth.controller.ts`)
- P: register (`:186`), login (`:250`), refresh (`:343`), send-code-reset-password, reset-password, google, google/one-tap, google/callback, exchange (`:707`).
- U: logout, sendVerificationEmail, verifyAccount, send-code-change-password, change-password, me (`:620`), sync-refresh-token; devices (GET, DELETE :sessionId, POST logout-all-others); profile (GET/PUT, upload-avatar, upload-banner).
- gRPC `auth.grpc.controller.ts`: ValidateToken/GetUserInfo/CheckPermission (admin-only allow `:243-253`) — no callers.

### finance-service
- T: `/payment/create`, `status/:id`, `history`, `cancel/:id`, `subscription` (`payment.controller.ts:31-96`); `/wallet/info`, `/wallet/details` (`wallet.controller.ts:22,35`).
- P: `/payment/subscription/plans` (`:100`), `/webhook` (SePay, verified in service).

### admin-service — all `@UseGuards(AdminGuard)` → **A**
- `admin-users.controller.ts:36`: GET /admin/users, :id, PATCH :id (isAdmin/isVerified/isBanned/name/bio, `dto/update-user.body.ts:24-38`), POST :id/{ban,unban,grant-admin,revoke-admin}. Self-revoke/self-ban blocked (`admin-users.service.ts:63-64,347-420`); audited.
- finance (refund, credit, set-tier, tier), logs (recent, ticket, SSE), page-config, stats (+FE routes), audit, word-family categories.
- `AdminGuard` reads `isAdmin` from DB (`libs/common/src/guard/admin.guard.ts:64-91`).

## 2. Sharing fields (`BE/libs/database/src/models/`)
| Model | Fields |
|---|---|
| QuizSet | `isPublic` only — **no whitelist, no accessCode** (`exam.prisma:7`) |
| FlashCardSet | `isPublic`, `accessCode` (6-digit), `whitelist String[]`, `viewCount` (`exam.prisma:65-69,82`) |
| ExamRoom | none (`hostId`, `quizSetId`) (`exam.prisma:144-160`) |
| ExamSession | `assessType` 0 PUBLIC/1 PRIVATE, `accessCode`, `whitelist`, `autoJoinByLink`, `allowRetake`, `maxAttempts`, `showAnswersAfterSubmit`, start/end (`exam.prisma:162-194`) |
| StudyRoom | `inviteCode`, `accessType` 0/1/2, `whitelist`, `isActive`, `maxParticipants`; member role/isBanned/isMuted (`study-room.prisma:4-51`) |
| User | `isAdmin`, `isVerified`, `isBanned`, `deletedAt` — no role (`user.prisma:1-47`) |

How students get content today:
- Flashcard: teacher `POST :id/share` → `{shareUrl: FRONTEND_URL/study-flashcard/:id, accessCode}` (`flashcardset.service.ts:1739-1773`) or `PUT :id/sharing` (public/code/whitelist via users/search). Student opens FE `/study-flashcard/:id` (no route guard) → `study/:id/access` → `study/:id` | `with-code`. Code entry not remembered.
- Quiz: **no direct student path**. Only via ExamRoom → ExamSession (`/exam-session/:id`). Gateway `quiz-practice-attempts` proxy (`ai-study-proxy.controller.ts:789+`) has no backend; `QuizPracticeAttempt` model unused. → Student "study quiz granted by teacher" requires NEW QuizSet sharing (whitelist/code/public) + practice endpoints.

## 3. Wallet / subscription / credits
- Register creates `UserSubscription {tier:0,isActive:false}` in tx (`auth.service.ts:171-194`; OAuth `:576-605`) then publishes `USER_CREATED` (`:196-208,:613-625`) → finance creates Wallet balance 20 + welcome tx (`finance-service/src/events/user-event.handler.ts:42-80`). `/auth/me` returns wallet + subscription (`:697-707`).
- Admin bootstrap creates users without subscription/event → no wallet (`admin-bootstrap.service.ts:212-219`).
- Credits only deducted in AI (`ES/finance-client/finance-client.service.ts:110-155`, fails closed 403; `AI_FREE_MODE` bypass non-prod `:42-64`). `UpdateBalance` → "Wallet not found" if none (`wallet.grpc.controller.ts:86-95`).
- Quotas: `enforceFileUploadQuota` (`ai.service.ts:190-200`), AI chat `checkLimits`. Free tier: files 5, msg/min 5, chat 30.
- Implication: with students unable to pay, provision wallet + subscription only for TEACHER (on grant), idempotent; bootstrapped admins need provisioning too if they teach. FE reads balance for everyone: `ProfilePage.tsx:294`, `SubscriptionPage`, `useAuthStore.updateWalletBalance`; pricing CTA `PricingBand.tsx:22` → `/k/subscription`.

## 4. FE surface
Guards (`FE/src/routes/guards/`): `ProtectedRoute` (auth only), `AdminRoute` (`user.isAdmin`), `PublicRoute`, `FeatureRoute` (page flag). `routes/guards/TeacherRoute.tsx` unused; `components/organisms/TeacherRoute.tsx` auth-only, used in `AIToolPage.tsx:360`, `ManageExamPage.tsx:236`, `ManageExamRoomPage.tsx:208`, `ManageExamRoomDetailPage`, `ExamRoomSessionAnalyticsPage`.

Routes (`FE/src/routes/index.tsx`) → proposed:
| Path | Proposed |
|---|---|
| landing/legal, auth pages | P |
| `/k` (KRootRedirect → `/k/ai-tool`) | U → role-based redirect (TEACHER → `/k/ai-tool`? STUDENT → `/k/my-materials`) |
| `/k/profile`, `/k/verify` | U |
| `/k/subscription` | T |
| `/k/my-materials` | S |
| `/k/flash-card`, `/k/manage-flashcard-set/:id`, `/k/manage-exam`, `/k/manage-quiz-set/:id`, `/k/ai-tool`, `/k/manage-exam-room*` | T |
| `/k/history` (split), `/k/history/pdf` | T; `/k/history/exam` S |
| `/study-flashcard/:id` (no guard), `/exam-session/:id(/quiz)` | S (backend checks) |
| `/k/my-exams` | S |
| `/k/study-room`, `/:id` | S (hide create for students: `create-room-modal.tsx`) |
| `/k/word-family*` | S (hide generate / to-flashcard for students) |
| `/admin/*` | A |
Dead: `AITeacherPage.tsx` (AI chat UI) has no route; `ProfileDropdown` links `/k/settings` (unrouted).

Sidebar `FE/src/components/organisms/k/SideBar.tsx:87-198`: filter only `adminOnly` + page flags; `SidebarItem` type (`:36-45`) has no role. Items: AI tool (T), word-family (S), my-materials (S), my-exams (S), manage-exam (T), flash-card (T), manage-exam-room (T), study-room (S), history (T/S split), admin (A). Page keys `FE/src/lib/page-keys.ts`.

Auth store: `FE/src/types/user.ts:6-22` `User {id: number (!backend uses cuid string), username, email, name, avatar, banner, bio, isAdmin, isVerified, createdAt, updatedAt, wallet:{balance}}`; `FE/src/stores/useAuthStore.ts:25-43`; hydrated via `/auth/me`, not persisted.

AdminUsersPage: `FE/src/pages/admin/AdminUsersPage.tsx` → `components/admin/UserTable.tsx` (filters search/isAdmin/isBanned/date `:40-70`; actions ban/unban, grant/revoke admin `:89-97,180-223`) via `FE/src/apis/adminApi.ts:116-148`. No role UI.

Signup `FE/src/components/organisms/auth/signup-form.tsx:67-143`: username, email, password, confirm + Turnstile + Google; payload `CredentialsSignup` (`FE/src/apis/authApi.ts:11-17`); BE DTO `apps/auth-service/src/dto/register.dto.ts` no role. Old `role-selection.tsx` deleted.

## 5. Admin bootstrap
- CLI `BE/apps/admin-service/src/commands/cli.ts`: `sync` (ADMIN_EMAILS, ADMIN_DEFAULT_PASSWORD), `list`, `grant <email>`, `revoke <email>` via `admin-management.service.ts:30-99`.
- `AdminBootstrapService.onModuleInit` auto-syncs every boot (`admin-service.module.ts:11,32`; `admin-bootstrap.service.ts:146-219`); creates missing user `isAdmin=true,isVerified=true` (no wallet).
- Runtime: `POST /admin/users/:id/grant-admin|revoke-admin`, `PATCH :id {isAdmin}` (`admin-users.service.ts:50`), audited.

## 6. Leftover old-role refs
- None for `UserRole`, `RolesGuard`, `@Roles(` in BE/FE.
- `auth.proto:28` (`int32 role = 5`), `:44` (`int32 role = 6`); `auth.grpc.controller.ts:17,31,81,111,122,132,141,177,190,202` set `role = isAdmin ? 1 : 0` → replace with new roles.
- Keep: `StudyRoomMember.role`, `AIChatMessage.role`, FE `types/studyRoom.ts`.
- Legacy names: FE `TeacherRoute` ×2; `AITeacherPage`, `virtualTeacherApi.ts`, `genaiTutorKnowledgeApi.ts` (`/virtual-teacher/*`, `/ai/tutor/*` not in backend).

## 7. Security gaps exposed by STUDENT/TEACHER split (must fix in RBAC work)
1. `GET /quizsets/public/:id` returns full answer key anonymously (`quizset.controller.ts:256`, `quizset.service.ts:245-270`).
2. Exam study endpoints likely leak answers + `accessCode` + `whitelist` via `...examSession` spread (`examsession.service.ts:556,617`) — inferred, untested.
3. Flashcard study endpoints leak `accessCode`, `whitelist` (`flashcardset.service.ts:1199-1205`).
4. `GET examrooms/get-public/:id` no access check, leaks `host.email` (`examroom.service.ts:126-150`).
5. `users/search` (flashcardsets + examsessions) lets any user enumerate emails → TEACHER-only, no emails/rate-limit.
6. `generate-code` wipes whitelist (`flashcardset.controller.ts:690-694`, `examsession.controller.ts:277-282`).
7. Pin + study-progress endpoints lack access checks (`student.service.ts:106,135`, `flashcard-study.service.ts:66`).
8. `ai-chat/:chatId/exists` no ownership (`ai-chat.service.ts:153`).
9. Word-family AI generation free and open to all (`word-family.service.ts:169,263`).
