# Phase 09 — Frontend RBAC

## Context Links
- Brief: [reports/planner-brief.md](./reports/planner-brief.md) (§09, decision 12)
- Research: [researcher-01](./research/researcher-01-rbac-report.md) §5 (useCan, RequirePermission, sidebar config, TOKEN_STALE)
- Scout: [RBAC surface](./reports/scout-rbac-surface-report.md) §4 (routes, sidebar, guards, auth store, `User.id` bug)
- Phase 04 `/auth/me|login|refresh` → `{ user, roles, permissions }`. Phase 06 endpoint table + WS `auth:reauth`. Phase 07/08 new routes and pure FE modules. <!-- Red Team: RT-5, RT-11 -->
- Red team (authoritative where it conflicts): [reports/red-team-changes.md](./reports/red-team-changes.md) RT-11, RT-15 (FE gates) <!-- Red Team: RT-11, RT-13, RT-15 -->. RT-13 compat fields are reversed by [validation-session-1](./reports/validation-session-1.md) Q6 (mobile unreleased). <!-- Updated: Validation Session 1 - no compat tolerance -->

## Overview
- Priority: P1 · Status: Pending · Effort: 3.5d <!-- Red Team: RT-5, RT-11 (was 3d: +vitest setup and the first FE tests incl. 07/08 pure modules, +study-room socket re-auth) --> · Depends on: 04, 07, 08
- Drive the whole FE from server-provided `permissions`:
  - route guards and a 403 page;
  - a permission-filtered sidebar and admin nav;
  - a role-based `/k` landing;
  - hide creation/AI/wallet UI from students;
  - handle `TOKEN_STALE` (refresh, apply the new session, reset role-scoped caches, retry once);
  - study-room socket re-auth on `auth:reauth` / token errors (refresh, reconnect once); <!-- Red Team: RT-5 -->
  - a generated `Permission` type with a CI drift check;
  - `User.id: string`;
  - the FE test runner (vitest), introduced here: this phase writes the first FE tests. <!-- Red Team: RT-11 -->
- UI hiding is UX only. The backend (06) is authoritative.

## Key Insights
- The JWT is HttpOnly, so FE cannot decode roles. It uses `roles`/`permissions` from login/refresh/me (04).
- Guards in `src/routes/guards/`:
  - `ProtectedRoute` (auth only);
  - `AdminRoute` (`user.isAdmin`, `AdminRoute.tsx:20`);
  - `FeatureRoute` (page flag);
  - an unused `TeacherRoute.tsx`, plus `components/organisms/TeacherRoute.tsx` (auth-only), used in `AIToolPage`, `ManageExamPage`, `ManageExamRoomPage`, `ManageExamRoomDetailPage`, `ExamRoomSessionAnalyticsPage`.
- `KRootRedirect.tsx` always goes to `/k/ai-tool`. Sidebar (`SideBar.tsx:87-198`) filters only `adminOnly` + page flags (`adminOnly` → `user?.isAdmin === true`, `:188-189`). Labels are hardcoded vi (keep, no churn).
- <!-- Red Team: RT-15 --> Current-user `user.isAdmin` reads are exactly `SideBar.tsx:189` and `AdminRoute.tsx:20` (this phase). The other `isAdmin` hits (`adminApi.ts`, `components/admin/{UserTable,UserDetailDrawer}.tsx`, `useAdminStore.ts`) are admin-list rows, renamed by phase 08.
- `api.ts` already has a single-flight `refreshPromise` (`:18,63-86`) and a 401 → refresh → retry loop (`:105-137`) guarded by `config._retry` (`:14,115,121`). Add session application, cache reset, and keep that flag as the retry-once cap. <!-- Red Team: RT-15 -->
- <!-- Red Team: RT-3, RT-15 --> `401 TOKEN_STALE` means the token's `av` claim is behind the user's `authzVersion` (gateway, 05). One refresh issues a token with the current `av` and roles; a second `TOKEN_STALE` on the retried request goes to the logout flow (no loop).
- Feature caches: Zustand 5 stores (`getInitialState()` available → reset without editing each store) + `src/lib/storeCache.ts` (`storeCache.clear()`, `:76,167`; used by `HistoryPage`). Both must be cleared when roles change. <!-- Red Team: RT-15 -->
- <!-- Red Team: RT-11 --> No FE test runner exists (`package.json` scripts: dev/build/preview/start/lint). `tsconfig.json` includes `src/lib/**/*.ts`, so `*.test.ts` there are type-checked by `yarn build` (`tsc -b`): vitest must be installed in the same commit as the first test. `vite.config.ts` defines the `@` alias, so `vitest.config.ts` reuses it via `mergeConfig(viteConfig, defineConfig({ test }))`.
- `/auth/me` has no `isAdmin` alias (phase 04, no compat contract) <!-- Updated: Validation Session 1 - no compat tolerance -->. `user.wallet` is still today's field until phase 10 removes it and moves the balance to `GET /wallet/info`; this phase only gates its display.
- <!-- Red Team: RT-5 --> `hooks/useStudyRoomSocket.ts` has no `connect_error` handling (`:46-70`). From 06 the server disconnects at token `exp` and on `authz_changed` (event `auth:reauth`), and rejects stale/expired tokens at handshake. A server-side disconnect does not auto-reconnect in socket.io.
- `HistoryPage` loads PDF history (TEACHER) and exam history (STUDENT) together. It must call only the permitted APIs.
- i18n: `common` namespace exists in vi/en/ja (`public/locales/*/common.json`, flat dotted keys). New user-facing RBAC strings go there.
- `types/user.ts:7` `id: number`. The backend uses cuid strings.

## Requirements
- Functional:
  - `src/types/permissions.generated.ts` (generated, committed): `PERMISSIONS` const, `Permission` union, `Role` union, and `ROLE_PERMISSIONS` as emitted from the catalog (TEACHER includes `word_family:save` <!-- Updated: Validation Session 1 - TEACHER += word_family:save -->). The generator `examio-be/scripts/gen-fe-permissions.ts` reads `libs/auth-jwt/src/permissions.ts`. CI runs the generator, then `git diff --exit-code`.
  - `User` type: `id: string`, `role: "STUDENT"|"TEACHER"`, `isSystemAdmin: boolean`, `wallet?: {balance:number} | null` (today's field; phase 10 removes it). **No `isAdmin` field.** Decisions use `permissions`. `ProfilePage` keeps reading `user.wallet?.balance` (behind `wallet:use`) until phase 10. <!-- Red Team: RT-15 --> <!-- Updated: Validation Session 1 - no compat tolerance -->
  - FE test runner <!-- Red Team: RT-11 -->: `vitest` devDependency, script `"test": "vitest run"`, `vitest.config.ts` = `mergeConfig(viteConfig, defineConfig({ test: { environment: "node", include: ["src/**/*.test.ts"] } }))`. Tests import `describe/it/expect` from `"vitest"` (no globals, so `tsc -b` type-checks them). CI `fe` job runs `yarn test`.
  - Auth store: `roles: Role[]`, `permissions: Permission[]`, `applySession(payload)` (login, refresh, `getUser`). Cleared on logout.
  - `useCan(p)` and `useCanAny(ps)` (`src/hooks/useCan.ts`). `<RequirePermission permission|anyOf>`: initializing → loader; not authed → `/login?from=`; denied → `<Navigate to="/403" replace>`.
  - `/403` page (`ForbiddenPage`): title, description, "Về trang chính" → role landing.
  - `/k` landing (`lib/rbac/landing-path.ts`, pure), first match wins:
    1. `from` param;
    2. TEACHER (with or without admin) → `/k/ai-tool`;
    3. "admin-only" = `isSystemAdmin && role === "STUDENT"` → `/admin`;
    4. STUDENT → `/k/my-materials`.
    If the target page flag is off → first visible sidebar item.
  - Route table + sidebar + admin nav per the tables below.
  - Hide UI by permission:
    - study-room "Tạo phòng" (`create-room-modal` trigger, `study_room:create`);
    - word-family "Sinh bằng AI" (`word_family:generate`, TEACHER only), "Chuyển thành flashcard" (`flashcardset:manage`), "Lưu" + "Từ đã lưu" (`word_family:save`, STUDENT and TEACHER) <!-- Updated: Validation Session 1 - TEACHER += word_family:save -->;
    - profile wallet balance (`ProfilePage.tsx:294`, `wallet:use`);
    - landing pricing CTA (`PricingBand.tsx:22`): for an authenticated user without `subscription:manage`, the CTA becomes the text "Gói dành cho giáo viên";
    - `ExamSessionPage` "Bắt đầu làm bài" without `exam:take` → notice "Tài khoản giáo viên không thể làm bài thi";
    - `ProfileDropdown` dead `/k/settings` link removed.
  - `HistoryPage`: fetch PDF history only with `ai:generate`, exam history only with `exam:take`, and hide the tabs accordingly.
  - API errors (in `api.ts`):
    - 401 `TOKEN_EXPIRED|TOKEN_STALE` → refresh (single flight; the new token carries the current `av`) → `applySession` → if roles changed: `resetRoleScopedState()` → retry the original once (existing `config._retry`). A second 401 (incl. `TOKEN_STALE`) → logout flow. <!-- Red Team: RT-3, RT-15 -->
    - 401 `SESSION_REVOKED` → refresh fails → existing clear + `/login`.
    - 403 `PERMISSION_DENIED` → toast "Bạn không có quyền thực hiện thao tác này" + one debounced `getUser()` (permissions may have changed).
    - 403 `EMAIL_NOT_VERIFIED` → navigate `/k/verify`.
  - Study-room socket (`useStudyRoomSocket.ts`) <!-- Red Team: RT-5 -->:
    - `auth:reauth` (any reason) or `connect_error` with `TOKEN_EXPIRED|TOKEN_STALE` → the same single-flight `refreshAccessToken()` → `applySession` (+ reset if roles changed) → `socket.connect()` once; the existing `connect` handler re-joins the room;
    - refresh fails, or a second token error after the reconnect → existing logout flow;
    - `connect_error` `PERMISSION_DENIED` → toast "Bạn không có quyền vào phòng học chung" + `onKicked`;
    - `SERVICE_UNAVAILABLE` → keep socket.io's normal reconnect backoff.
  - Delete both `TeacherRoute.tsx` files. Pages lose their internal wrapper and the route guards take over.
  - i18n `common.json` (vi/en/ja): `forbidden.title`, `forbidden.description`, `forbidden.backHome`, `roles.student`, `roles.teacher`, `roles.systemAdmin`, `rbac.permissionDenied`, `rbac.teacherOnly`, `rbac.teacherCannotTakeExam`, `rbac.plansForTeachers`.
- Non-functional: no flash of forbidden content (guards wait for `initializing`). No extra `/auth/me` calls on navigation (store cache, CLAUDE.md). Bundle unchanged except tiny helpers.

Route → permission (every route in `src/routes/index.tsx`):

| Path | Guard |
|---|---|
| `/`, `/about`, `/contact`, `/terms`, `/privacy`, `/cookies`, `/security` | public |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | `PublicRoute` |
| `/k` | `ProtectedRoute` → landing redirect |
| `/k/profile`, `/k/verify`, `/403` | `ProtectedRoute` (authenticated) |
| `/k/subscription` | `subscription:manage` |
| `/k/my-materials` | `flashcard:study` |
| `/k/practice-quiz/:id` (07) | anyOf `quiz:practice`, `quizset:manage` (owner preview; BE decides) |
| `/k/flash-card`, `/k/manage-flashcard-set/:id` | `flashcardset:manage` |
| `/k/manage-exam`, `/k/manage-quiz-set/:id` | `quizset:manage` |
| `/k/ai-tool` | `ai:generate` |
| `/k/manage-exam-room`, `/k/manage-exam-room/:id` | `exam_room:manage` |
| `/k/manage-exam-room/:id/session/:sessionId` | `exam_result:view` |
| `/k/history` | anyOf `ai:generate`, `exam:take` |
| `/k/history/pdf` | `ai:generate` |
| `/k/history/exam`, `/k/my-exams` | `exam:take` |
| `/k/study-room`, `/k/study-room/:id` | `study_room:join` |
| `/k/word-family`, `/k/word-family/:slug`, `/k/word-family/:slug/:rootWord` | `word_family:read` |
| `/study-flashcard/:id` | `ProtectedRoute` + anyOf `flashcard:study`, `flashcardset:manage` (anonymous → login → back) |
| `/exam-session/:id` | public (info page; join CTA → login) |
| `/exam-session/:id/quiz` | `exam:take` |
| `/admin` (layout) | `admin:access` (replaces `AdminRoute` isAdmin) |
| `/admin` index, `/admin/stats` | `stats:read` |
| `/admin/users` | `user:manage` |
| `/admin/roles` (08) | `role:assign` |
| `/admin/finance` | `finance:admin` |
| `/admin/logs` | `logs:read` |
| `/admin/audit` | `audit:read` |
| `/admin/word-family` | `word_family:admin` |
| `/admin/page-config` | `page_config:manage` |
| `*` | NotFound |

Feature page flags (`FeatureRoute`) stay as they are, nested inside the permission guard.

Sidebar (`SideBar.tsx`) item → permission (filter = permission AND page flag not `false`):

| Item (label) | href | permission |
|---|---|---|
| Công cụ AI | `/k/ai-tool` | `ai:generate` |
| Từ vựng tiếng Anh | `/k/word-family` | `word_family:read` |
| Tài liệu của tôi | `/k/my-materials` | `flashcard:study` |
| Bài thi của tôi | `/k/my-exams` | `exam:take` |
| Quản lý Đề thi | `/k/manage-exam` | `quizset:manage` |
| Quản lý Flashcard | `/k/flash-card` | `flashcardset:manage` |
| Quản lý Phòng thi | `/k/manage-exam-room` | `exam_room:manage` |
| Phòng học chung | `/k/study-room` | `study_room:join` |
| Lịch sử | `/k/history` (STUDENT: `/k/history/exam`) | anyOf `ai:generate`, `exam:take` |
| Trang quản trị | `/admin` | `admin:access` |

Admin nav (`AdminLayout.tsx`) items use the same permissions as the admin routes above.

## Architecture
```
login/refresh/me ─► useAuthStore.applySession({user, roles, permissions})
route ─► RequirePermission(useCan) ─► FeatureRoute ─► page
sidebar NAV config [{href, permission}] ─► filter(useCan && pageFlag)
api 401 TOKEN_STALE ─► refreshAccessToken() (single flight) ─► applySession ─► rolesChanged? resetRoleScopedState() ─► retry once
socket auth:reauth | connect_error TOKEN_* ─► refreshAccessToken() (same single flight) ─► applySession ─► socket.connect() once
resetRoleScopedState = for each store in ROLE_SCOPED_STORES: store.setState(store.getInitialState(), true); storeCache.clear()
```
<!-- Red Team: RT-5 -->

## Related Code Files
File ownership (globs): `examio-fe/src/types/{user.ts,permissions.generated.ts}`, `examio-fe/src/stores/{useAuthStore.ts,reset-role-scoped-state.ts}`, `examio-fe/src/hooks/useCan.ts`, `examio-fe/src/lib/rbac/**`, `examio-fe/src/apis/{api.ts,authApi.ts}`, `examio-fe/src/routes/**`, `examio-fe/src/pages/errors/**`, `examio-fe/src/pages/k/{KRootRedirect,HistoryPage,ProfilePage,AIToolPage,ManageExamPage,ManageExamRoomPage,ManageExamRoomDetailPage,ExamRoomSessionAnalyticsPage,WordFamilyPage,WordFamilyCategoryPage,WordFamilyDetailPage}.tsx`, `examio-fe/src/pages/study-room/StudyRoomListPage.tsx`, `examio-fe/src/pages/exam-session/**` (start CTA only), `examio-fe/src/components/organisms/{k/SideBar.tsx,TeacherRoute.tsx,landing/PricingBand.tsx}`, `examio-fe/src/components/atoms/ProfileDropdown.tsx`, `examio-fe/public/locales/{vi,en,ja}/common.json`, `examio-be/scripts/gen-fe-permissions.ts`, `examio-be/package.json` (script), `/.github/workflows/ci.yml` (drift check + FE `yarn test`). Any FE file reading `user.id` as number (found by `tsc`), **except** the phase-08 admin files (`apis/adminApi.ts`, `components/admin/**`, `stores/useAdminStore.ts`, already string ids + `isSystemAdmin`). <!-- Red Team: RT-15 -->
- <!-- Red Team: RT-5, RT-11, RT-15 --> Also owned: `examio-fe/{package.json,yarn.lock,vitest.config.ts}`, `examio-fe/src/hooks/useStudyRoomSocket.ts`, `examio-fe/src/lib/quiz-practice/progress.test.ts` and `examio-fe/src/lib/admin-roles/role-change-rules.test.ts` (test files only; the modules belong to 07/08, merged before 09). Explicitly `SideBar.tsx` and `routes/guards/AdminRoute.tsx` are 09's; admin FE files are 08's.

- Create:
  - `/Users/tgiap.dev/devs/examio/examio-fe/src/types/permissions.generated.ts`, `/Users/tgiap.dev/devs/examio/examio-be/scripts/gen-fe-permissions.ts`
  - `/Users/tgiap.dev/devs/examio/examio-fe/src/hooks/useCan.ts`, `/Users/tgiap.dev/devs/examio/examio-fe/src/routes/guards/RequirePermission.tsx`
  - `/Users/tgiap.dev/devs/examio/examio-fe/src/pages/errors/ForbiddenPage.tsx`
  - `/Users/tgiap.dev/devs/examio/examio-fe/src/lib/rbac/{landing-path.ts,landing-path.test.ts,nav-items.ts,nav-items.test.ts,api-error-policy.ts,api-error-policy.test.ts}`
  - `/Users/tgiap.dev/devs/examio/examio-fe/src/stores/reset-role-scoped-state.ts`
  - `/Users/tgiap.dev/devs/examio/examio-fe/vitest.config.ts`, `/Users/tgiap.dev/devs/examio/examio-fe/src/lib/quiz-practice/progress.test.ts`, `/Users/tgiap.dev/devs/examio/examio-fe/src/lib/admin-roles/role-change-rules.test.ts` <!-- Red Team: RT-11 -->
- Modify:
  - `/Users/tgiap.dev/devs/examio/examio-fe/src/types/user.ts`, `/Users/tgiap.dev/devs/examio/examio-fe/src/stores/useAuthStore.ts`, `/Users/tgiap.dev/devs/examio/examio-fe/src/apis/{api.ts,authApi.ts}`
  - `/Users/tgiap.dev/devs/examio/examio-fe/src/routes/index.tsx`, `/Users/tgiap.dev/devs/examio/examio-fe/src/routes/guards/AdminRoute.tsx` (→ thin wrapper over `RequirePermission admin:access`, or delete and inline), `/Users/tgiap.dev/devs/examio/examio-fe/src/routes/layouts/AdminLayout.tsx`
  - `/Users/tgiap.dev/devs/examio/examio-fe/src/pages/k/KRootRedirect.tsx`, `/Users/tgiap.dev/devs/examio/examio-fe/src/components/organisms/k/SideBar.tsx`, `/Users/tgiap.dev/devs/examio/examio-fe/src/pages/k/HistoryPage.tsx`, `/Users/tgiap.dev/devs/examio/examio-fe/src/pages/k/ProfilePage.tsx`
  - `/Users/tgiap.dev/devs/examio/examio-fe/src/pages/study-room/StudyRoomListPage.tsx`, word-family pages/components (generate/save/to-flashcard buttons), `/Users/tgiap.dev/devs/examio/examio-fe/src/components/organisms/landing/PricingBand.tsx`, `/Users/tgiap.dev/devs/examio/examio-fe/src/components/atoms/ProfileDropdown.tsx`, exam-session start CTA [UNVERIFIED file: `src/pages/exam-session/ExamSessionPage.tsx`]
  - the 5 pages using `components/organisms/TeacherRoute.tsx` (remove the wrapper)
  - `/Users/tgiap.dev/devs/examio/examio-fe/public/locales/{vi,en,ja}/common.json`
  - `/Users/tgiap.dev/devs/examio/examio-fe/package.json` (`vitest` devDependency, `test` script), `/Users/tgiap.dev/devs/examio/examio-fe/src/hooks/useStudyRoomSocket.ts` (re-auth) <!-- Red Team: RT-5, RT-11 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/package.json` (`gen:fe-permissions`), `/Users/tgiap.dev/devs/examio/.github/workflows/ci.yml` (drift check, FE `yarn test`) <!-- Red Team: RT-11 -->
- Delete: `/Users/tgiap.dev/devs/examio/examio-fe/src/routes/guards/TeacherRoute.tsx`, `/Users/tgiap.dev/devs/examio/examio-fe/src/components/organisms/TeacherRoute.tsx`

## Implementation Steps
0. Test runner: `yarn add -D vitest`, `vitest.config.ts` with `mergeConfig(viteConfig, …)`, script `test`. Smoke: a trivial import of `@/lib/utils` resolves under vitest. <!-- Red Team: RT-11 -->
1. Write the vitest specs first (`lib/rbac/*.test.ts`, plus `lib/quiz-practice/progress.test.ts` and `lib/admin-roles/role-change-rules.test.ts` for the 07/08 modules), see Tests. <!-- Red Team: RT-11 -->
2. Generator: `gen-fe-permissions.ts` imports `PERMISSIONS` and emits the const + unions with a "DO NOT EDIT" header, double quotes, 2-space indent. Add the BE script `gen:fe-permissions`. Commit the output. Add the CI step `yarn gen:fe-permissions && git diff --exit-code ../examio-fe/src/types/permissions.generated.ts`.
3. Types + store: `User.id: string` (fix the `tsc` fallout outside the 08 admin files, e.g. study room `myId`), `isAdmin` removed from the type, `wallet?` left as today (phase 10 removes it) <!-- Updated: Validation Session 1 - no compat tolerance -->, `applySession`, `roles`, `permissions`. `login`, `refreshSession`, `getUser` all call `applySession`. <!-- Red Team: RT-13, RT-15 -->
4. `useCan`, `RequirePermission`, `ForbiddenPage`, `/403` route. Rewire `routes/index.tsx` per the table. `AdminRoute` uses `admin:access` (replaces `AdminRoute.tsx:20`). <!-- Red Team: RT-15 -->
5. `landing-path.ts` + `KRootRedirect`. `nav-items.ts` (pure config + `filterNav(can, pageMap)`) used by `SideBar` (drops `adminOnly`/`user?.isAdmin`, `SideBar.tsx:188-189`). Admin nav is filtered the same way. <!-- Red Team: RT-15 -->
6. `api-error-policy.ts` (pure: maps `{status, code, retried}` → action, plus `socketErrorAction(code, retried)` for the socket) + `api.ts` wiring (existing `_retry` flag). `reset-role-scoped-state.ts` lists every feature store (`useQuizSetStore`, `useFlashcardSetStore`, `useExamRoomStore`, `useExamRoomDetailStore`, `useExamSessionStore`, `useStudentMaterialsStore`, `useStudyRoomStore`, `useWordFamilyStore`, `useAIGeneratorStore`, `useStatsStore`, `useAdminStore`, `useAdminRolesStore`, `useQuizPracticeStore`, `usePageConfigStore` excluded) + `storeCache.clear()`. <!-- Red Team: RT-5, RT-15 -->
6b. `useStudyRoomSocket.ts`: `auth:reauth` + `connect_error` handlers per Requirements, using `socketErrorAction` and the single-flight `refreshAccessToken()` (`api.ts:63`, module-private today → export it). <!-- Red Team: RT-5 -->
7. UI hiding (list above). Remove the `TeacherRoute` wrappers. Make `HistoryPage` permission-aware.
8. i18n strings in vi/en/ja `common.json`.
9. Manual matrix in the browser with 3 accounts (STUDENT, TEACHER, STUDENT+ADMIN):
   - landing target;
   - visible sidebar items;
   - direct URL to a forbidden page → `/403`;
   - an admin promotes a STUDENT while they are logged in → their next API call refreshes and the sidebar updates without a reload, with no stale teacher data after a demotion;
   - a STUDENT in a study room is promoted → socket gets `auth:reauth`, reconnects, stays in the room. <!-- Red Team: RT-5 -->

## Tests
- Write first (vitest, `examio-fe/src/lib/rbac/`):
  - `landing-path.test.ts`: TEACHER → `/k/ai-tool`; STUDENT → `/k/my-materials`; STUDENT+ADMIN → `/admin`; TEACHER+ADMIN → `/k/ai-tool`; `from` wins; disabled page flag → next allowed item.
  - `word-family-actions` check inside `nav-items.test.ts` (or `useCan` test): TEACHER permissions → "Lưu"/"Từ đã lưu" and "Sinh bằng AI" visible; STUDENT → "Lưu" visible, "Sinh bằng AI" hidden <!-- Updated: Validation Session 1 - TEACHER += word_family:save -->.
  - `nav-items.test.ts`: STUDENT sees exactly [Từ vựng, Tài liệu, Bài thi, Phòng học chung, Lịch sử]. TEACHER sees [Công cụ AI, Từ vựng, Quản lý Đề thi, Quản lý Flashcard, Quản lý Phòng thi, Phòng học chung, Lịch sử]. The admin item appears only with `admin:access`. A page flag `false` hides the item.
  - `api-error-policy.test.ts`: `TOKEN_STALE` not retried → refresh+retry; already retried → logout; `SESSION_REVOKED` → logout; `PERMISSION_DENIED` → toast+refetch; `EMAIL_NOT_VERIFIED` → verify redirect; socket `auth:reauth`/`TOKEN_EXPIRED` not retried → refresh+reconnect, already retried → logout, `PERMISSION_DENIED` → leave room, `SERVICE_UNAVAILABLE` → backoff. <!-- Red Team: RT-5 -->
- <!-- Red Team: RT-11 --> Tests for modules shipped by 07/08 (first FE runner is here):
  - `src/lib/quiz-practice/progress.test.ts`: autosave payload holds only `answers, currentIndex, markedQuestions, timeSpentSeconds`; resume index = stored `currentIndex` clamped to the question count; empty attempt → 0.
  - `src/lib/admin-roles/role-change-rules.test.ts`: self row not editable; last admin switch locked; non-last admin editable; `canBanRow` false for self and for the last admin; consequence keys per direction; `LAST_SYSTEM_ADMIN` and other 409 map to their keys; unknown error → default key. <!-- Red Team: RT-15 -->
- Drift check: `permissions.generated.ts` equals the generator output (CI).
- BE unchanged (no new BE tests). Phase 06 matrix remains the source of truth.

## Todo List
- [ ] vitest installed + `vitest.config.ts` (`mergeConfig`) + `test` script + CI step <!-- Red Team: RT-11 -->
- [ ] vitest specs (landing, nav, api error policy incl. socket, 07 progress, 08 role rules) red <!-- Red Team: RT-5, RT-11 -->
- [ ] Permission type generator + committed output + CI drift check
- [ ] User type (`id: string`, role, isSystemAdmin; no `isAdmin`) + store applySession/roles/permissions <!-- Updated: Validation Session 1 - no compat tolerance -->
- [ ] useCan, RequirePermission, /403 page
- [ ] Route table rewired (every route) + AdminRoute on admin:access + admin nav filter
- [ ] Role-based /k landing
- [ ] Permission-driven sidebar
- [ ] TOKEN_STALE refresh → applySession → reset caches → retry once (`_retry`); 403 handling
- [ ] Study-room socket re-auth (`auth:reauth`, `connect_error`) <!-- Red Team: RT-5 -->
- [ ] Hide student-forbidden UI; HistoryPage split; TeacherRoute removed
- [ ] i18n vi/en/ja common.json
- [ ] Manual 3-account matrix

## Success Criteria
- `cd examio-fe && yarn build && yarn lint && yarn test`: exit 0.
- `cd examio-be && yarn gen:fe-permissions && git diff --exit-code ../examio-fe/src/types/permissions.generated.ts`: exit 0.
- `grep -rnE "user\??\.isAdmin|TeacherRoute" examio-fe/src` → none, and `grep -n "isAdmin" examio-fe/src/types/user.ts` → none. <!-- Red Team: RT-15 --> <!-- Updated: Validation Session 1 - no compat tolerance -->
- `cd examio-fe && yarn test` runs ≥ 5 spec files (rbac ×3, quiz-practice, admin-roles). <!-- Red Team: RT-11 -->
- STUDENT browsing `/k/ai-tool` directly → `/403`. Its network log shows zero 403 responses while clicking every visible sidebar item.
- After an admin promotes a logged-in STUDENT, the user's next click yields `401 TOKEN_STALE` → one refresh → teacher sidebar, with no full reload and no second refresh.
- <!-- Red Team: RT-5 --> A student in a study room for > 15 min (token `exp`) stays in the room: one `auth:reauth` → refresh → reconnect → snapshot re-applied, no navigation away.

## Risk Assessment
- Missing a hidden-button spot → student sees a button and gets a 403 toast (safe, cosmetic). Mitigation: manual sweep + the zero-403 network check above.
- Refresh storm across tabs → single-flight per tab plus retry-once cap. Cross-tab is acceptable (each tab refreshes once).
- `User.id` type change ripples through many files → `tsc` lists every site. Mechanical fixes only.
- Resetting stores while a page is mounted → reset happens before the retried request resolves. Pages re-fetch on the next render (stores refetch on empty state).
- Mobile parity → phase 18.
- <!-- Red Team: RT-11 --> vitest config drifts from the Vite config (aliases) → `mergeConfig(viteConfig, …)` reuses the alias; the step-0 smoke import proves it.
- <!-- Red Team: RT-5 --> Socket reconnect loop if refresh keeps returning a stale token → retry-once flag per disconnect cycle, then logout.
- Dropping `isAdmin` from the FE type surfaces any leftover read as a `tsc` error → intended; fix the site to use `permissions`. <!-- Updated: Validation Session 1 - no compat tolerance -->

## Rollback
- Revert the FE commits (guards/sidebar/api policy are independent commits). The backend keeps enforcing (06), so a revert only degrades UX.
- The generator script is additive. Remove the CI step if it blocks unrelated work (lead sign-off).
- <!-- Red Team: RT-5, RT-11 --> vitest (devDependency + config + CI step) and the socket re-auth are separate commits; reverting the socket commit leaves users disconnected at token `exp` (06 behaviour), so revert 06's WS commit with it.

## Security Considerations
- Never derive authorization from client-side state alone. All routes are also enforced server-side.
- `permissions` are not persisted to localStorage (store is in-memory, hydrated via `/auth/me`), so tampering has no effect beyond the local UI.
- Clearing role-scoped caches on a role change prevents demoted users from seeing cached teacher data.
- The 403 page reveals no resource details.

## Next Steps
- Unblocks 18 (mobile mirrors the same route/sidebar tables via the `permissions` payload) and 19 (docs `docs/system/permissions.md` can embed these tables).
- [CROSS-PHASE] No compat fields: `isAdmin` is never sent (04); phase 10 removes `user.wallet` from `/auth/me` and `types/user.ts` and moves the balance to `GET /wallet/info`. Phase 19 has no compat step. <!-- Updated: Validation Session 1 - no compat tolerance -->
- [CROSS-PHASE] Sidebar/`/k` page labels remain hardcoded vi (existing style). Full i18n of `/k` pages is out of scope; only new RBAC strings are localized.
