# Phase 09 — Frontend RBAC

## Context Links
- Brief: [reports/planner-brief.md](./reports/planner-brief.md) (§09, decision 12)
- Research: [researcher-01](./research/researcher-01-rbac-report.md) §5 (useCan, RequirePermission, sidebar config, TOKEN_STALE)
- Scout: [RBAC surface](./reports/scout-rbac-surface-report.md) §4 (routes, sidebar, guards, auth store, `User.id` bug)
- Phase 04 `/auth/me|login|refresh` → `{ user, roles, permissions }`. Phase 06 endpoint table + WS `auth:reauth`. Phase 07/08 new routes and pure FE modules. <!-- Red Team: RT-5, RT-11 -->
- Red team (authoritative where it conflicts): [reports/red-team-changes.md](./reports/red-team-changes.md) RT-11, RT-15 (FE gates) <!-- Red Team: RT-11, RT-13, RT-15 -->. RT-13 compat fields are reversed by [validation-session-1](./reports/validation-session-1.md) Q6 (mobile unreleased). <!-- Updated: Validation Session 1 - no compat tolerance -->

## Overview
- Priority: P1 · Status: Completed (pending commit) · Effort: 3.5d <!-- Red Team: RT-5, RT-11 (was 3d: +vitest setup and the first FE tests incl. 07/08 pure modules, +study-room socket re-auth) --> · Depends on: 04, 07, 08
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
- [x] vitest installed + `vitest.config.ts` (`mergeConfig`) + `test` script + CI step <!-- Red Team: RT-11 --> — `yarn test` = 9 files / 86 tests, green in temper 6; CI `fe` job runs `yarn test`.
- [x] vitest specs (landing, nav, api error policy incl. socket, 07 progress, 08 role rules) red <!-- Red Team: RT-5, RT-11 --> — written and green (`src/lib/rbac/*.test.ts`, `quiz-practice/progress.test.ts`, `admin-roles/role-change-rules.test.ts`).
- [ ] Permission type generator + committed output + CI drift check — generator and CI step exist, but **the output is not committed** (`permissions.generated.ts` is untracked), so the drift check is vacuous. Closes on commit.
- [x] User type (`id: string`, role, isSystemAdmin; no `isAdmin`) + store applySession/roles/permissions <!-- Updated: Validation Session 1 - no compat tolerance --> — `id: string`, `isSystemAdmin`, no `isAdmin`; login, refresh and getUser call `applySession`.
- [x] useCan, RequirePermission, /403 page — files present; 9/9 forbidden direct URLs reach `/403` (live).
- [x] Route table rewired (every route) + AdminRoute on admin:access + admin nav filter — live items 3 and 8; `AdminRoute` gated on `admin:access`.
- [x] Role-based /k landing — live item 1 (3/3); `landing-path.test.ts`.
- [x] Permission-driven sidebar — live item 2 (exact set per role); `nav-items.test.ts`.
- [x] TOKEN_STALE refresh → applySession → reset caches → retry once (`_retry`); 403 handling — live 5a/5b (exactly one refresh per flip) and item 10 (4 flips, one refresh each). The 403 toast and `EMAIL_NOT_VERIFIED` → `/k/verify` are unit-tested (`api-error-policy.test.ts`), not live-verified.
- [x] Study-room socket re-auth (`auth:reauth`, `connect_error`) <!-- Red Team: RT-5 --> — live item 7 via the `authz_changed` path (one refresh, one reconnect, stays in room). `connect_error` TOKEN_* is unit-tested. The 15-min `exp` path is not live-verified (D12).
- [x] Hide student-forbidden UI; HistoryPage split; TeacherRoute removed — live items 4 and 6; grep for `TeacherRoute` and `user?.isAdmin` is clean. The "Từ đã lưu" view does not exist in the FE (spec gap, D10).
- [x] i18n vi/en/ja common.json — RBAC keys present in all three locales.
- [x] Manual 3-account matrix — run as an automated headless browser (puppeteer-core 24.43.1, real Chrome), not by hand: final run 64 PASS / 0 FAIL / 1 NOTE (the NOTE is D10).

## Delivered beyond plan (fixes found in tempering)
Scope drift from the original plan. Cost: edits outside 09's file ownership (the BE items need review by the auth, exam and libs owners). The evidence records no effort figures, so none are given here.
- **F1 refresh-cookie rotation.** `/auth/refresh` now rotates the `refreshToken` cookie. The defect is pre-existing on `main`, not a regression from this branch. Reason: browser sessions died about 60 s after the first refresh. Files: `examio-be/apps/auth-service/src/auth.controller.ts`, new `test/refresh-cookie.e2e-spec.ts`.
- **F2 single-flight `getUser`.** The `getUser` fallback goes through `refreshAccessToken()`. Reason: a demotion produced two refreshes where the plan expects one.
- **F3 transient errors keep the session.** A transient `/auth/me` error keeps the session, and a cold load shows a `SessionUnavailable` screen instead of `/login`. Reason: a 429 or 502 during a cold reload logged the user out.
- **F5 teacher exam-session notice.** The stats call is skipped without `exam:take`, and the teacher sees the notice (`exam-stats-gate.test.ts`). Reason: teachers got a 403 and an endless spinner.
- **Review M1/L1 socket recovery.** SERVICE_UNAVAILABLE retries use jittered backoff (1, 2, 4, 8, 16 s, max 5), one reconnect per re-auth cycle, a 5 s minimum interval, and a give-up toast `rbac.studyRoomUnavailable` (`hooks/study-room-socket-recovery.ts`, `lib/rbac/socket-reconnect.ts`).
- **M2 interceptor.** A transient refresh failure keeps the session (logout only on 401/403), on the HTTP path and on the socket re-auth path.
- **M3 CI drift check hardened.**
- **F6 exam-service survives a Redis outage (BE).** `redis-io.adapter.ts` (`createAdapterClients`), `runSafely` and `StudyRoomWsExceptionFilter` (`study-room-redis-safety.ts`), `RedisUnavailableFilter` maps to 503, and `libs/redis` gets a subscriber error listener and a safe quit. Reason: the process exited, which blocked socket recovery. The user approved fixing it in P09. Files: exam-service and `libs/redis`.
- **F7 capped socket.io reconnection.** `reconnectionAttempts 5`, `delayMax 30 s`, and a give-up toast. Reason: the reconnect loop was unbounded (127 ECONNREFUSED in about 10 min).
- **Cleanup.** Dead `refreshSession` and `syncRefreshTokenApi` removed. Four spec files added beyond the plan's list (`session-probe`, `guard-decision`, `exam-stats-gate`, `socket-reconnect`), 9 in total.
- **Matrix method.** Automated headless browser instead of a manual run. Screenshots are in `evidence/phase-09/ui-screens/`.

## Deferred / carried
Open items. Each has a target phase and an owner. None of them is a regression in the shipped behaviour.

| # | Item | Lands in | Owner | Done when |
|---|------|----------|-------|-----------|
| D1 | socket.io transport attempts are not capped between namespace errors (F8: about 15 attempts in 5 min, bounded, not a crash) | 16 | lead | A socket test counts transport attempts: at most 6 before give-up while the namespace is down |
| D2 | No `enableShutdownHooks` or graceful SIGTERM in exam-service | 12 (study-room-service `main.ts`), verified in 16 | lead | SIGTERM drains sockets and closes Redis clients, with no unhandled rejection on restart |
| D3 | The first Redis-dependent call during an outage returns 504 (gateway timeout), later calls 503. Opt-in `REDIS_COMMAND_TIMEOUT_MS` | 16 (per-service env) | lead | Value set per env; outage probe gets 503 on the first call |
| D4 | `libs/common/src/events/event-subscriber.service.ts:50` runs JSON.parse outside try (legacy consumer) | 14 (new consumers on `@examio/messaging`) | lead | Legacy file deleted; a malformed message is rejected, not thrown |
| D5 | Deep import `ioredis/built/errors` (in the adapter) | 12 (adapter moves) | lead | No deep import in `apps/` or `libs/`; match `err.name` or pin `ioredis ~5.10` |
| D6 | A late stale 401 can trigger a second refresh (harmless) | none, observe | lead | No action unless it recurs as a loop |
| D7 | `/auth/refresh` still returns `refreshToken` in the body (web uses the cookie only) | 18 (mobile contract decision) | user | Decision recorded; body field kept with a reason or removed |
| D8 | Public `ExamSessionPage` ignores `sessionUnavailable` | 14 (session pages move to assessment) | lead | Public page shows a retry state on a transient failure |
| D9 | A possible double 403 toast on one action | 10 (FE pass, after 09 lands) | lead | A test shows one toast per denied action |
| D10 | "Từ đã lưu" saved-words view does not exist in the FE (spec item) | none until decided | user (product) | Decide: build the view, or drop the spec line |
| D11 | Word-family generate label: UI "Sinh từ con" / "Sinh lại từ con", spec "Sinh bằng AI" | 19 (docs), after the copy is chosen | user decides | Spec and UI copy agree |
| D12 | 15-min token-expiry socket path (`exp` disconnect) not run live | 16 (cutover smoke, short-TTL run) | lead | One live run: `auth:reauth` or TOKEN_EXPIRED → reconnect → stays in room |
| D13 | `/study-flashcard/:id` now needs login plus `flashcard:study` or `flashcardset:manage`; anonymous share links must log in first | 19 (business rules); product sign-off needed | user | Decision recorded; phase-07 sharing copy checked |
| D14 | The e2e helper demotes pre-existing admins; the matrix DB was reused once | 16 (CI e2e on a dedicated DB) | lead | CI e2e job uses its own DB; no shared fixtures |
| D15 | Auth global throttle 30 req/60 s per IP (F4): users behind shared NAT get 429 on each full load (now shows SessionUnavailable, not logout) | 16 decision before cutover | user decides | Throttle keyed per user or raised; decision recorded |

## Success Criteria
- `cd examio-fe && yarn build && yarn lint && yarn test`: exit 0.
- `cd examio-be && yarn gen:fe-permissions && git diff --exit-code ../examio-fe/src/types/permissions.generated.ts`: exit 0.
- `grep -rnE "user\??\.isAdmin|TeacherRoute" examio-fe/src` → none, and `grep -n "isAdmin" examio-fe/src/types/user.ts` → none. <!-- Red Team: RT-15 --> <!-- Updated: Validation Session 1 - no compat tolerance -->
- `cd examio-fe && yarn test` runs ≥ 5 spec files (rbac ×3, quiz-practice, admin-roles). <!-- Red Team: RT-11 -->
- STUDENT browsing `/k/ai-tool` directly → `/403`. Its network log shows zero 403 responses while clicking every visible sidebar item.
- After an admin promotes a logged-in STUDENT, the user's next click yields `401 TOKEN_STALE` → one refresh → teacher sidebar, with no full reload and no second refresh.
- <!-- Red Team: RT-5 --> A student in a study room for > 15 min (token `exp`) stays in the room: one `auth:reauth` → refresh → reconnect → snapshot re-applied, no navigation away.

**Status 2026-10-22 (after temper 6):**
- Met: `yarn build && yarn lint && yarn test` (9 spec files, 5 required); grep for `isAdmin` and `TeacherRoute` is clean; STUDENT on `/k/ai-tool` → `/403`; zero-403 sweep; a promotion gives one refresh and the teacher sidebar with no reload.
- Not met yet: the drift check (`git diff --exit-code`) is vacuous until `permissions.generated.ts` is committed.
- Not run: the > 15 min study-room criterion (D12). The `authz_changed` path was used instead. The plan allows it, but the criterion as written is unverified.

## Risk Assessment
Register as of 2026-10-22. Closed items stay listed with their evidence so nothing stale sits open.
- **[OPEN, low]** Missing a hidden-button spot → a student sees a button and gets a 403 toast (safe, cosmetic). The zero-403 sweep passed (matrix item 4). Re-check whenever a new button lands.
- **[CLOSED]** Refresh storm across tabs. Single-flight per tab plus retry-once cap. Matrix 5b and 10: one refresh per flip.
- **[CLOSED]** `User.id` type change ripples through many files. `tsc` is clean; no id-as-number sites remain outside the 08 admin files.
- **[CLOSED]** Resetting stores while a page is mounted. Live flips show pages refetching; no stale teacher data after demotion (5b, 10).
- **[OPEN, carried]** Mobile parity → phase 18 (see D7).
- **[CLOSED]** vitest config drift from the Vite aliases. The step-0 smoke and the 9 spec files resolve `@`.
- **[CLOSED]** Socket reconnect loop if refresh keeps returning a stale token. Retry once per cycle, capped reconnects. Rounds 5 and 6: 5 attempts, give-up at +30 s, 0 attempts for 60 s after.
- **[CLOSED]** Dropping `isAdmin` leaves leftover reads. Any read surfaces as a `tsc` error; grep is clean.
- **[CLOSED]** Redis outage kills exam-service and blocks socket recovery (F6). Rounds 5 and 6: a 358 s outage with the pid unchanged. Residual first-call 504 → D3.
- **[OPEN]** The drift check is vacuous until `permissions.generated.ts` is committed. Closes on commit (Todo line 3).
- **[CLOSED for cold load]** Transient auth error logs a user out (F3): `SessionUnavailable` screen. **[OPEN]** The throttle itself → D15.
- **[OPEN]** Public share links now need login → D13.
- **[CLOSED]** Auth refresh cookie not rotated (F1). Matrix item 10: 4 refreshes over 215 s, no logout.

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

### Next moves (owner · done mark)
1. **Commit the Phase 09 work** · owner: user approves; lead commits per the CLAUDE.md commit rules (no push). Done when `examio-fe/src/types/permissions.generated.ts` is tracked, `git diff --exit-code` on it is meaningful, Todo line 3 is ticked, and this status reads "Completed".
2. **Live 15-min socket check** · owner: lead, in the phase-16 cutover smoke (D12). Done when one run shows the TOKEN_EXPIRED reconnect and the student stays in the room.
3. **Decide the product items** · owner: user. D7 (refresh body token), D10 ("Từ đã lưu"), D11 (word-family copy), D13 (public share login), D15 (throttle). Done when each has a recorded decision in `clarifications.md` or the relevant phase file.
4. **Unblocks** phase 10 (FE step, now that 09 is in) and phase 18 (mirrors the route and sidebar tables).
