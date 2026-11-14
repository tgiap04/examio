# Phase 08 — Admin Role-Management Screen ("Phân quyền")

## Context Links
- Brief: [reports/planner-brief.md](./reports/planner-brief.md) (§08, decision 6)
- Decisions: [reports/decisions.md](./reports/decisions.md) (admin assigns roles; matrix read-only; TEACHER only via admin)
- Phase 04: `RoleChangeService` (advisory lock, `authzVersion`, `ROLE_CHANGE_CONFLICT`), auth gRPC `SetUserRole`/`SetSystemAdmin`/`ListUsers`/`ListRoleChanges`, auth `GatewayControlClient`, `ROLE_PERMISSIONS`, `libs/auth-jwt` `forwardUser(req)` <!-- Red Team: RT-2, RT-3 --> <!-- Reconcile: X1 -->
- Red team (authoritative where it conflicts): [reports/red-team-changes.md](./reports/red-team-changes.md) RT-2, RT-3, RT-15 (last admin, FE admin files) <!-- Red Team: RT-2, RT-3, RT-15 -->
- Scout: [RBAC surface](./reports/scout-rbac-surface-report.md) §4 AdminUsersPage/UserTable, §5 bootstrap

## Overview
- Priority: P1 · Status: Completed (2026-10-20) · Effort: 2.75d <!-- Red Team: RT-3, RT-15 (was 2d: +auth SetUserStatus server pulled forward from 10 + admin ban/unban on it, +isSystemAdmin rename across 4 admin FE files + list filter, +last-admin ban states; −admin gateway-control client) --> · Depends on: 04, 06
- Backend: admin-service `admin-roles` module over auth gRPC (no DB writes to `User`). Endpoints: list users, set base role, toggle SYSTEM_ADMIN, read-only matrix, change history. AdminAudit is written for every change. Ban/unban also move onto auth (`SetUserStatus`), so every authz-relevant `User` write bumps `authzVersion` inside auth. <!-- Red Team: RT-3 -->
- Frontend: `/admin/roles` page with user table, confirm dialog, matrix tab, history tab. `UserTable` loses grant/revoke-admin. The admin FE files switch from `isAdmin` to `isSystemAdmin`. <!-- Red Team: RT-15 -->

## Key Insights
- Today `POST /admin/users/:id/grant-admin|revoke-admin` and `PATCH :id {isAdmin}` write `User` directly (`admin-users.service.ts:50,347-420`). They bypass RoleChangeLog and InvalidateUser. 06 already dropped `isAdmin` from PATCH.
- <!-- Red Team: RT-3 --> `banUser`/`unbanUser` write `User` directly (`admin-users.service.ts:253-345`, sets `isBanned` + `deletedAt`). Phase 04 adds no interim ban. Admin cannot publish `auth.*` and must not call `InvalidateUser`, so this phase implements auth `SetUserStatus` (the only implementation; P10 does not touch it) and points ban/unban at it. 04 + 05 + 08 are verified together on local compose and reach production only in the single final-merge deploy, so there is no gap. <!-- Reconcile: X1 --> <!-- Updated: Validation Session 1 - single production deploy --> Auth then bumps `authzVersion`, revokes sessions, writes outbox `auth.user.authz_changed`, and calls gateway `InvalidateUser` after commit — the same path as role changes.
- Auth enforces every rule: self-change 403, last-admin 409 (role change in 04, ban in `SetUserStatus` here; both serialised by `pg_advisory_xact_lock(hashtext('role-change'))`), actor re-check (04). Admin-service maps errors and adds AdminAudit (admin-owned, has IP/UA). The UI guard is UX only. <!-- Red Team: RT-15 -->
- <!-- Red Team: RT-2 --> Every admin → auth RPC forwards the admin's own bearer token through the explicit `metadata` argument of the generated client wrapper (P02; no AsyncLocalStorage), built by P04's `forwardUser(req)` (`libs/auth-jwt/src/grpc-metadata.ts`). Auth's guard (`role:assign` / `user:manage`) runs on the RPC, and the actor is the token `sub`. No request message carries `actor_id`; admin-service never sends a service token for these calls.
- i18n: admin pages use flat dotted keys in `public/locales/{vi,en}/admin.json`. There is **no `ja/admin.json`** (ja falls back to en). i18next uses `:` as the namespace separator, so permission keys map to i18n keys with `:` → `_` (e.g. `roles.perm.quizset_manage`).
- antd 6 is used in admin (`UserTable.tsx` imports antd Table). Reuse antd `Table`, `Select`, `Switch`, `Modal`, `Tabs`, `Alert`, `Empty`, `Tooltip`.
- FE ids are typed `number` (`adminApi.ts:116-148`, `types/user.ts`). The backend uses cuid strings. This phase fixes `adminApi.ts`; `types/user.ts` changes in 09.
- <!-- Red Team: RT-15 --> `isAdmin` in the admin FE (grep): `adminApi.ts:13,65` (row type, list filter), `UserTable.tsx:41,50,65,131-133,180,268-271` (filter, column, actions), `UserDetailDrawer.tsx:17,114-116`, `useAdminStore.ts:275` (`listUsersApi({ isAdmin: true, pageSize: 100 })`). BE list filter `admin-users/dto/list-users.query.ts:23,58` → `admin-users.service.ts:86-87`. This phase owns renaming all of them to `isSystemAdmin`; phase 09 owns `SideBar.tsx` and `AdminRoute.tsx` (the current-user checks).
- <!-- Red Team: RT-11 --> FE vitest arrives in phase 09. FE rules stay in a pure module (`lib/admin-roles/role-change-rules.ts`); 09 writes its test.

## Requirements
- Functional BE (all `@RequirePermissions('role:assign')`, under the gateway `admin:access` prefix):
  - `GET /api/v1/admin/roles` → matrix from `ROLE_PERMISSIONS`:
    ```json
    { "roles": [{ "key": "STUDENT", "permissions": ["flashcard:study","quiz:practice","exam:take","study_room:join","word_family:read","word_family:save"] },
                { "key": "TEACHER", "permissions": ["quizset:manage","…"] }, { "key": "SYSTEM_ADMIN", "permissions": ["admin:access","…"] }],
      "permissions": ["flashcard:study","…all v1 keys in catalog order…"] }
    ```
  - `GET /api/v1/admin/roles/users?q=&role=STUDENT|TEACHER&isSystemAdmin=true|false&page=1&limit=20` (limit ≤100) → auth `ListUsers` + parallel admin count:
    ```json
    { "data": [{ "id": "clx…", "email": "a@x.io", "username": "a", "name": "A", "avatar": null, "role": "TEACHER",
                 "isSystemAdmin": false, "isBanned": false, "isVerified": true, "createdAt": "2026-10-17T08:00:00.000Z" }],
      "meta": { "page": 1, "limit": 20, "total": 134 }, "systemAdminCount": 2 }
    ```
  - `PUT /api/v1/admin/roles/users/:id/role`, body `{ "role": "TEACHER", "reason": "Giáo viên khối 10" }` (reason optional, ≤500) → `200 { "user": { …same item shape… } }`.
  - `PUT /api/v1/admin/roles/users/:id/system-admin`, body `{ "isSystemAdmin": true, "reason": "…" }` → `200 { "user": {…} }`.
  - Errors (envelope `{statusCode, code, message, requestId}`; this phase registers `HttpErrorEnvelopeFilter` from `libs/http` in admin-service <!-- Red Team: RT-11 -->): `400 VALIDATION_ERROR`, `403 CANNOT_CHANGE_OWN_ROLE`, `403 PERMISSION_DENIED`, `404 USER_NOT_FOUND`, `409 LAST_SYSTEM_ADMIN`, `409 ROLE_CHANGE_CONFLICT` when auth's advisory-lock/serialization retry is exhausted (04). A no-op change returns 200 with an unchanged user (no audit row). <!-- Red Team: RT-15 -->
  - `GET /api/v1/admin/roles/changes?userId=&page=1&limit=20` → auth `ListRoleChanges`:
    ```json
    { "data": [{ "id": "clx…", "targetUserId": "clx…", "targetEmail": "b@x.io", "actorUserId": "clx…", "actorEmail": "a@x.io",
                 "fromRole": "STUDENT", "toRole": "TEACHER", "fromAdmin": false, "toAdmin": false, "reason": null,
                 "source": "admin-ui", "createdAt": "2026-10-17T08:05:00.000Z" }], "meta": { "page": 1, "limit": 20, "total": 9 } }
    ```
  - After RPC success: AdminAudit `admin.role.set_base` / `admin.role.set_system_admin` with `{from,to,reason}`, IP, UA.
  - Remove `POST /admin/users/:id/grant-admin|revoke-admin` (+ service methods). `/admin/users` list select adds `role` (read-only display) and returns `isSystemAdmin` (not `isAdmin`); the list query filter is `isSystemAdmin=true|false`. <!-- Red Team: RT-15 -->
  - <!-- Red Team: RT-3 --> Auth `SetUserStatus(user_id, is_banned, reason)` (new here, `@RequirePermissions('user:manage')`, actor = token `sub`, re-read from DB like role changes). One tx: `pg_advisory_xact_lock(hashtext('role-change'))`; target `FOR UPDATE`; banning the last active SYSTEM_ADMIN → `FAILED_PRECONDITION LAST_SYSTEM_ADMIN`; self → `CANNOT_CHANGE_OWN_STATUS` (403); no-op → unchanged, no event; set `isBanned` (never `deletedAt`); `authzVersion++`; on ban `userSession.isActive=false` for all sessions; outbox `auth.user.authz_changed {userId, authzVersion, role, isSystemAdmin, isBanned, reason:"ban"|"unban", version: authzVersion}` <!-- Reconcile: X2 -->. `40P01`/`40001` → one retry → `ROLE_CHANGE_CONFLICT`. After commit: `gatewayControl.invalidateUser(userId, authzVersion)` (fail-soft).
  - `POST /admin/users/:id/ban|unban` keep their routes and response shape but call `SetUserStatus` with `forwardUser(req)` instead of writing `User`. <!-- Reconcile: X1 --> After RPC success admin writes AdminAudit `admin.user.ban` / `admin.user.unban` (existing action keys, `AdminAuditPage.tsx:15-16`).
  - No `InvalidateUser` call and no gateway-control client in admin-service (role change and ban both reach the gateway through auth). <!-- Red Team: RT-3 -->
  - `PATCH /admin/users/:id` drops `isBanned` too (`dto/update-user.body.ts:16`, `MUTABLE_FIELDS` `admin-users.service.ts:50`), so ban status changes only through `SetUserStatus` (`.strict()` → 400). <!-- Red Team: RT-3 -->
- Functional FE (`/admin/roles`, title "Phân quyền"; texts below are the vi strings, en added alongside):
  - Header: "Phân quyền". Subtitle: "Gán vai trò Học sinh / Giáo viên và quyền Quản trị hệ thống. Ma trận quyền chỉ để xem."
  - Tabs: "Người dùng" · "Ma trận quyền" · "Lịch sử thay đổi". The URL keeps `?tab=&q=&role=&admin=&page=` (shareable, back button works).
  - **Tab "Người dùng"**:
    - Filters: search "Tìm theo email hoặc tên đăng nhập…" (debounce 300ms, min 0); "Vai trò": Tất cả / Học sinh / Giáo viên; "Quản trị": Tất cả / Có / Không; "Xóa bộ lọc".
    - Columns:
      - "Người dùng" (avatar, name, email);
      - "Vai trò" (Select Học sinh | Giáo viên);
      - "Quản trị hệ thống" (Switch);
      - "Trạng thái" (badges "Bị khóa", "Chưa xác minh");
      - "Ngày tạo";
      - "Lịch sử" (link → history tab filtered).
    - Changing a control never applies directly. It opens the confirm dialog, and the control reverts if cancelled.
    - Guards (UX; server enforces):
      - self row: controls disabled, tooltip "Bạn không thể tự thay đổi vai trò của mình";
      - row `isSystemAdmin && systemAdminCount === 1`: Switch disabled, tooltip "Phải còn ít nhất một quản trị hệ thống".
    - States:
      - loading → table `loading` skeleton rows;
      - empty → `Empty` "Không có người dùng phù hợp" + "Xóa bộ lọc";
      - error → `Alert` "Không tải được danh sách người dùng" + "Thử lại".
    - Server pagination 20/page.
  - **Confirm dialog** (antd `Modal`):
    - Titles: "Xác nhận thay đổi vai trò" / "Xác nhận quyền quản trị".
    - Body: "Đổi vai trò của {name} ({email}) từ {from} sang {to}?" + one consequence line:
      - → Giáo viên: "Người dùng có thể tạo nội dung, dùng AI và ví. Ví và gói Free được tạo tự động (lần đầu tặng 20 credit)."
      - → Học sinh: "Người dùng mất quyền tạo/sửa nội dung, AI và ví. Nội dung đã tạo được giữ nguyên nhưng bị khoá quản lý; học sinh đã được chia sẻ vẫn học được. Số dư ví được giữ nguyên." <!-- Updated: Validation Session 1 - demotion copy -->
      - Cấp quản trị: "Người dùng sẽ truy cập được trang quản trị."
      - Thu hồi: "Người dùng sẽ mất quyền truy cập trang quản trị."
    - Always add: "Thay đổi có hiệu lực sau vài giây; người dùng có thể cần tải lại trang."
    - Textarea "Lý do (không bắt buộc)", max 500 + counter.
    - Buttons "Hủy" / "Xác nhận". Confirm is `danger` for demotion/revoke, shows loading, is disabled while pending.
    - Success toast "Đã cập nhật vai trò", then the row refreshes plus `systemAdminCount`.
    - Error toasts by `code`:
      - `CANNOT_CHANGE_OWN_ROLE` → "Bạn không thể tự thay đổi vai trò của mình";
      - `LAST_SYSTEM_ADMIN` → "Phải còn ít nhất một quản trị hệ thống";
      - `USER_NOT_FOUND` → "Người dùng không tồn tại";
      - `PERMISSION_DENIED` → "Bạn không có quyền thực hiện thao tác này";
      - `ROLE_CHANGE_CONFLICT` or any other 409 → "Có thay đổi đồng thời, vui lòng tải lại và thử lại" + list refetch; <!-- Red Team: RT-15 -->
      - default → "Không thể cập nhật vai trò, vui lòng thử lại".
    - After `409 LAST_SYSTEM_ADMIN` the dialog closes, the control reverts, and the list + `systemAdminCount` refetch (the UI count was stale). <!-- Red Team: RT-15 -->
  - **Tab "Ma trận quyền"** (read-only):
    - Rows = permissions grouped: Học tập (`flashcard:study`, `quiz:practice`, `exam:take`, `study_room:join`, `word_family:*` user), Nội dung, Thi cử, AI, Ví & gói, Quản trị.
    - Columns Học sinh / Giáo viên / Quản trị hệ thống with ✓ icons (aria-label "Có"/"Không").
    - Each row shows the label plus the raw key in monospace.
    - Footnote: "Ma trận được định nghĩa trong mã nguồn, không chỉnh sửa tại đây."
    - Loading/error states.
  - **Tab "Lịch sử thay đổi"**:
    - Columns:
      - "Thời gian";
      - "Người thực hiện" (email, or "CLI" when `source=cli`);
      - "Người dùng";
      - "Thay đổi" ("Học sinh → Giáo viên", "Cấp quản trị", "Thu hồi quản trị");
      - "Lý do";
      - "Nguồn" (Giao diện quản trị / CLI / Khởi tạo).
    - User filter chip. Empty "Chưa có thay đổi nào". Error + retry.
  - Admin nav: new item "Phân quyền" (`nav.roles`) after "Người dùng".
  - `UserTable`: remove grant/revoke-admin actions and the isAdmin column. Show a `RoleBadge` (role + admin) instead, plus action "Phân quyền" → `/admin/roles?q=<email>`.
  - <!-- Red Team: RT-15 --> Rename to `isSystemAdmin` in `apis/adminApi.ts`, `components/admin/UserTable.tsx` (filter "Quản trị", badge), `components/admin/UserDetailDrawer.tsx`, `stores/useAdminStore.ts` (`fetchAdminList` → `listUsersApi({ isSystemAdmin: true, pageSize: 100 })`).
  - <!-- Red Team: RT-15 --> Last-admin states on `/admin/users` (ban):
    - "Khóa" is disabled with tooltip "Không thể khóa quản trị hệ thống cuối cùng" when `row.isSystemAdmin && adminCount === 1` (`adminCount` = `fetchAdminList().length`, already cached in `useAdminStore`), and on the current user's own row ("Bạn không thể tự khóa tài khoản của mình");
    - server `409 LAST_SYSTEM_ADMIN` on ban → toast "Không thể khóa quản trị hệ thống cuối cùng", then invalidate the admin list and refetch the row;
    - server `403 CANNOT_CHANGE_OWN_STATUS` → toast "Bạn không thể tự khóa tài khoản của mình";
    - the ban confirm adds: "Người dùng bị đăng xuất khỏi mọi thiết bị ngay lập tức."
- Non-functional: all list calls server-paginated. No N+1 (ListUsers batch). Components <200 lines. Keyboard-accessible dialog (antd default focus trap).

## Architecture
```
AdminRolesPage ─► useAdminRolesStore ─► adminRolesApi ─► GET/PUT /api/v1/admin/roles/*
gateway (admin:access) ─► admin-service AdminRolesController (role:assign) ─► AdminRolesService
   ─► clients/auth.client.ts (libs/grpc, explicit md = admin's bearer token) ─► auth SetUserRole / SetSystemAdmin / ListUsers / ListRoleChanges
   ─► on success: AuditWriterService.write(admin.role.*)          (auth tx: RoleChangeLog + authzVersion++ + outbox authz_changed; after commit InvalidateUser)
admin-service AdminUsersController ban|unban (user:manage) ─► auth SetUserStatus (same md)
   ─► on success: AuditWriterService.write(admin.user.ban|unban)  (auth tx: isBanned + authzVersion++ + sessions revoked + outbox; after commit InvalidateUser)
```
<!-- Red Team: RT-2, RT-3 -->

## Related Code Files
File ownership (globs): `kmaedu-be/apps/admin-service/src/modules/admin-roles/**`, `kmaedu-be/apps/admin-service/src/clients/auth.client.ts`, `kmaedu-be/apps/admin-service/src/modules/admin-users/{admin-users.controller.ts,admin-users.service.ts,user-select.safe.ts,dto/list-users.query.ts,dto/update-user.body.ts}`, `kmaedu-be/apps/admin-service/src/{admin-service.module.ts,main.ts}`, `kmaedu-be/apps/admin-service/test/{admin-roles.e2e-spec.ts,ban.e2e-spec.ts,jest-e2e.json}`, `kmaedu-be/apps/auth-service/src/user-status/**`, `kmaedu-be/apps/auth-service/src/grpc/auth.grpc.controller.ts` (`SetUserStatus` handler only), `kmaedu-be/apps/auth-service/src/auth.module.ts` (module import line), `kmaedu-fe/src/pages/admin/AdminRolesPage.tsx`, `kmaedu-fe/src/components/admin/roles/**`, `kmaedu-fe/src/components/admin/{UserTable,UserDetailDrawer}.tsx`, `kmaedu-fe/src/apis/{adminApi,adminRolesApi}.ts`, `kmaedu-fe/src/stores/{useAdminRolesStore,useAdminStore}.ts`, `kmaedu-fe/src/lib/admin-roles/**` (no `*.test.ts`; 09 adds it), `kmaedu-fe/src/routes/layouts/AdminLayout.tsx`, `kmaedu-fe/public/locales/{vi,en}/admin.json`, `kmaedu-fe/src/routes/index.tsx` (one child route, after 07 merges). Not owned here: `SideBar.tsx`, `AdminRoute.tsx` (phase 09). <!-- Red Team: RT-3, RT-11, RT-15 -->

- Create:
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/admin-service/src/modules/admin-roles/{admin-roles.module.ts,admin-roles.controller.ts,admin-roles.service.ts,admin-roles.mapper.ts,dto/set-role.dto.ts,dto/set-system-admin.dto.ts,dto/list-role-users.query.ts}`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/admin-service/src/clients/auth.client.ts` <!-- Red Team: RT-3 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/admin-service/test/admin-roles.e2e-spec.ts`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/auth-service/src/user-status/{user-status.module.ts,user-status.service.ts,user-status.service.spec.ts}` <!-- Red Team: RT-3 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/pages/admin/AdminRolesPage.tsx`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/components/admin/roles/{RoleUserTable,RoleUserFilters,RoleChangeDialog,PermissionMatrix,RoleChangeHistory,RoleBadge}.tsx`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/apis/adminRolesApi.ts`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/stores/useAdminRolesStore.ts`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/lib/admin-roles/{role-change-rules.ts,permission-groups.ts}` (test in 09) <!-- Red Team: RT-11 -->
- Modify:
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/admin-service/src/{admin-service.module.ts,main.ts}` (`main.ts`: register `HttpErrorEnvelopeFilter`) <!-- Red Team: RT-11 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/auth-service/src/grpc/auth.grpc.controller.ts` (`SetUserStatus` replaces the `UNIMPLEMENTED` stub), `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/auth-service/src/auth.module.ts`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/admin-service/test/ban.e2e-spec.ts` (create; through auth; `jest-e2e.json` from 04) <!-- Red Team: RT-3 --> <!-- Reconcile: X1 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/admin-service/src/modules/admin-users/{admin-users.controller.ts,admin-users.service.ts,user-select.safe.ts,dto/list-users.query.ts,dto/update-user.body.ts}` (ban/unban → `SetUserStatus`; PATCH drops `isBanned`; `isSystemAdmin` filter + field) <!-- Red Team: RT-3, RT-15 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/components/admin/UserTable.tsx`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/components/admin/UserDetailDrawer.tsx` (role badge, `isSystemAdmin`, last-admin ban states) <!-- Red Team: RT-15 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/apis/adminApi.ts` (drop grant/revoke, ids `string`, `isSystemAdmin`), `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/stores/useAdminStore.ts` (`:275` filter), `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/routes/layouts/AdminLayout.tsx`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/routes/index.tsx` <!-- Red Team: RT-15 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/public/locales/vi/admin.json`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/public/locales/en/admin.json`
- Delete: `grantAdmin`/`revokeAdmin` in `admin-users.service.ts` + controller handlers; the direct `User` writes in `banUser`/`unbanUser` (`admin-users.service.ts:253-345`); <!-- Reconcile: X1 --> `grantAdminApi`/`revokeAdminApi` in `adminApi.ts`; i18n keys `users.actions.{grantAdmin,revokeAdmin,grantSuccess,revokeSuccess,grantError,revokeError,cannotRevokeSelf}`, `users.columns.isAdmin` (replaced by `users.columns.isSystemAdmin`). <!-- Red Team: RT-3, RT-15 -->

## Implementation Steps
1. BE tests first (see Tests).
2. `clients/auth.client.ts` via `GrpcClientModule.register` (02) using generated `AuthServiceClient`. Every call takes `md = forwardUser(req)` (04 `libs/auth-jwt/src/grpc-metadata.ts`: the admin's bearer token + `x-request-id`) as the explicit `metadata` argument. No `actor_id`, no service token. <!-- Red Team: RT-2 -->
3. `AdminRolesService`:
   - `matrix()` reads `ROLE_PERMISSIONS`/`PERMISSIONS` from `@kmaedu/auth-jwt`;
   - `listUsers()` runs `ListUsers` + `ListUsers({isSystemAdmin:true,limit:1})` in `Promise.all` for `systemAdminCount`;
   - `setRole()` / `setSystemAdmin()` call the RPC, then write audit;
   - `listChanges()`.
   The mapper converts proto enums ↔ strings.
4. Controller with DTOs (zod, `.strict()`, `reason` trimmed ≤500), `@RequirePermissions(P.ROLE_ASSIGN)`. Error codes preserved from gRPC details through `libs/grpc` error map.
5. Remove grant/revoke from admin-users. Add `role` to the safe select; rename `isAdmin` → `isSystemAdmin` in the safe select, `list-users.query.ts` and the `where` filter (skip what 04 already renamed). Implement auth `SetUserStatus` (`user-status.service.ts`, Requirements), then rewrite `banUser`/`unbanUser` as the RPC + AdminAudit (no `prisma.user.update`, no `InvalidateUser`). <!-- Reconcile: X1 --> Register `HttpErrorEnvelopeFilter` in admin `main.ts`. <!-- Red Team: RT-3, RT-11, RT-15 -->
6. FE:
   - `adminRolesApi.ts` (typed per the contracts above);
   - store (cache list per query key; invalidate on change);
   - `lib/admin-roles/role-change-rules.ts`, pure: `canEditRow(row, currentUserId, systemAdminCount)` → `{ editable, reasonKey }`; `canBanRow(row, currentUserId, adminCount)` → `{ allowed, reasonKey }`; `consequenceKeys(change)`; `errorMessageKey(status, code)` (any other 409 → concurrent-change key). <!-- Red Team: RT-15 -->
7. Components + page (tabs with URL state). `permission-groups.ts` maps permission → group + i18n key (`:` → `_`).
8. Admin nav item + route `/admin/roles` (after 07 merged). Update `UserTable` and `UserDetailDrawer` (role badge, `isSystemAdmin`, last-admin/self ban states, 409 handling); `adminApi.ts` + `useAdminStore.ts` filter rename. <!-- Red Team: RT-15 -->
9. Locales: add `nav.roles`, `pages.roles.{title,subtitle}`, `roles.*` (tabs, filters, columns, dialog, errors, matrix groups, `roles.perm.<key>` for all 29 keys, history) to vi + en. Remove the obsolete keys.
10. Manual: as admin A promote B → B refreshes and sees the teacher UI. Demote back → the dialog shows the "bị khoá quản lý" line; B's quiz/flashcard sets still exist and B gets 403 on their manage endpoints <!-- Updated: Validation Session 1 - demotion copy -->. Try self (disabled), and last admin (disabled + server 409 via curl). Ban B while B is logged in → B's next request is 401 and refresh fails. Ban the last admin via curl → 409; the UI button is disabled. <!-- Red Team: RT-3, RT-15 -->

## Tests
- Write first:
  - `apps/admin-service/src/modules/admin-roles/admin-roles.service.spec.ts`:
    - RPC `PERMISSION_DENIED` → 403 `PERMISSION_DENIED`, `FAILED_PRECONDITION LAST_SYSTEM_ADMIN` → 409;
    - audit written only on success;
    - no-op → no audit;
    - metadata carries the caller's `authorization` (admin token, not a service token) and the request has no `actor_id`. <!-- Red Team: RT-2 -->
  - <!-- Red Team: RT-3 --> `apps/admin-service/src/modules/admin-users/admin-users.service.spec.ts`: `banUser` calls `SetUserStatus(is_banned=true)` with the admin token, writes `admin.user.ban` audit only on success, never calls `prisma.user.update` or a gateway client; `LAST_SYSTEM_ADMIN` → 409.
  - <!-- Red Team: RT-3, RT-15 --> `apps/auth-service/src/user-status/user-status.service.spec.ts`: last active admin → `LAST_SYSTEM_ADMIN`; self → `CANNOT_CHANGE_OWN_STATUS`; no-op → no update, no outbox; ban → `authzVersion+1`, sessions inactive, outbox `authz_changed(ban)` in the same tx, `invalidateUser(id, av)` after commit; `40P01` once → retried; twice → `ROLE_CHANGE_CONFLICT`.
  - FE rules (`role-change-rules.ts`) are tested in phase 09 (first FE test runner). <!-- Red Team: RT-11 -->
- E2E (`apps/admin-service/test/admin-roles.e2e-spec.ts`, real auth + admin + Postgres + RabbitMQ):
  - A (admin) sets B → TEACHER: 200, RoleChangeLog row, AdminAudit row, B's `authzVersion` +1, outbox `auth.user.authz_changed {role:'TEACHER'}` (only event), finance wallet 20 (money path); <!-- Red Team: RT-3 --> <!-- Reconcile: X2 -->
  - A sets A → 403;
  - A demotes TEACHER B (owns a quiz set) → 200; B's set and `ownerId` unchanged; B `PUT /quizsets/:id` → 403 `PERMISSION_DENIED` <!-- Updated: Validation Session 1 - demotion keeps content -->;
  - A revokes the only other admin when 2 admins exist → 200, then revoking self is blocked (403);
  - a STUDENT token → 403 at the service even if the gateway is bypassed;
  - a TEACHER+ADMIN token whose `role:assign` was revoked a moment ago still fails at auth (DB actor re-check). <!-- Red Team: RT-2 -->
- <!-- Red Team: RT-3, RT-15 --> E2E (`apps/admin-service/test/ban.e2e-spec.ts`, new here, through auth): <!-- Reconcile: X1 --> A bans B → 200, B `isBanned`, `deletedAt` unchanged, B's sessions inactive, `authzVersion` +1, outbox `auth.user.authz_changed {reason:"ban"}`, AdminAudit row; B's refresh → 401; unban → `authzVersion` +1 again; with one admin left, banning that admin → 409 `LAST_SYSTEM_ADMIN`; two concurrent bans of the last two admins → exactly one succeeds; the gateway (if running) answers B's next request with `401 TOKEN_STALE` or `SESSION_REVOKED`.
- Phase-06 declaration test passes with the new controller.

## Todo List
- [x] BE service specs (roles + ban) red <!-- Red Team: RT-3, RT-11 --> (evidence: phase-08-runs.md, RED seen first)
- [x] admin-service auth gRPC client (explicit admin-token metadata) <!-- Red Team: RT-2 --> (evidence: phase-08-runs.md, auth.client spec; admin e2e)
- [x] admin-roles module (matrix, users, set role, set admin, changes) + audit (evidence: admin-roles e2e, 36/36 admin trio)
- [x] auth `SetUserStatus` (advisory lock, last-admin, av bump, sessions, outbox, InvalidateUser after commit) <!-- Red Team: RT-3, RT-15 --> (evidence: user-status specs, ban e2e, gateway-probe.json)
- [x] Remove grant/revoke-admin (BE + FE); ban/unban → auth `SetUserStatus` (no direct `User` write, no `InvalidateUser`) <!-- Red Team: RT-3 --> (evidence: grep runs, phase-08-runs.md)
- [x] `isSystemAdmin` rename: BE list filter/select + `adminApi.ts`, `UserTable.tsx`, `UserDetailDrawer.tsx`, `useAdminStore.ts` <!-- Red Team: RT-15 --> (evidence: grep isAdmin = none; admin trio)
- [ ] FE api/store/rules + page with 3 tabs, dialog, states, guards — OPEN: tabs, dialog, guards and empty state verified (ui-browser-run 27/27); loading and error states and 409 toast mapping not in evidence
- [ ] Admin nav + route; UserTable/Drawer role badge; last-admin + self ban states, 409 handling <!-- Red Team: RT-15 --> — OPEN: route, role badge and self-ban disabled verified; nav click, UserDetailDrawer, last-admin ban disabled state and 409 toasts not in evidence
- [x] vi/en admin.json keys (evidence: 29 `roles.perm.*` keys in each locale; removed `users.*` grant/revoke keys absent)
- [x] e2e + manual verification (evidence: admin trio 36/36, auth CI set 35/35, gateway-probe 16/16, ui-browser-run 27/27)

## Success Criteria
- `cd kmaedu-be && yarn typecheck && yarn build:all && yarn test`: exit 0. `cd kmaedu-be/apps/admin-service && ../../node_modules/.bin/jest --config test/jest-e2e.json test/admin-roles.e2e-spec.ts test/ban.e2e-spec.ts` (create `test/jest-e2e.json` if missing): exit 0. <!-- Red Team: RT-3 -->
- `cd kmaedu-fe && yarn build && yarn lint`: exit 0. <!-- Red Team: RT-11 -->
- `grep -rn "grant-admin\|revoke-admin\|grantAdminApi" kmaedu-be/apps kmaedu-fe/src` → none.
- <!-- Red Team: RT-3, RT-15 --> `grep -rn "isAdmin" kmaedu-fe/src/{apis/adminApi.ts,components/admin,stores/useAdminStore.ts} kmaedu-be/apps/admin-service/src` → none. `grep -rn "InvalidateUser\|invalidateUser\|gateway-control" kmaedu-be/apps/admin-service/src` → none. `grep -n "prisma.user.update\|tx.user.update" kmaedu-be/apps/admin-service/src/modules/admin-users/admin-users.service.ts` → only the non-authz `updateUser` path (name/bio/isVerified; moves to auth in 10).
- Promoting a user in the UI shows a new row in "Lịch sử thay đổi" and in `/admin/audit`. The promoted user's next request gets `TOKEN_STALE` → auto-refresh → teacher sidebar (with 09).

## Risk Assessment
- gRPC error codes lose the business `code` → `libs/grpc` puts `code` in status `details` and maps it back. The service spec covers it.
- Two parallel RPCs per list call (count) → cheap indexed count; or drop it if latency matters (≤ +5ms).
- Route file collision with 07 → step 8 gated on 07 merge (see Next Steps).
- `ja` locale missing admin.json → falls back to en. Acceptable (admin is internal).
- <!-- Red Team: RT-3 --> Editing auth-service while phase 05 is in flight → file collision risk Low: 08 touches only `auth.grpc.controller.ts` (`SetUserStatus` handler), a new `user-status/**` module and one `auth.module.ts` import line; 05 owns `auth.controller.ts`, `auth.service.ts`, `devices.service.ts`. Lead serialises the `auth.module.ts` line if both are open.
- <!-- Red Team: RT-15 --> The UI `adminCount` is stale under concurrent admin edits → the button looks enabled, the server returns 409, and the UI refetches. Server is authoritative.

## Rollback
- Revert FE commit (UserTable regains nothing: grant/revoke removal is in the same revert). Revert BE commit restores grant/revoke endpoints (DB-direct path from 04).
- <!-- Red Team: RT-3 --> The ban → `SetUserStatus` change is its own commit. Reverting it restores today's DB-direct ban (no `av` bump, no session revoke: the banned user's access token works until `exp`, ≤15 min, while refresh already fails since 04). Prefer fix-forward; `SetUserStatus` itself is additive and can stay. <!-- Reconcile: X1 -->

## Security Considerations
- Authorization is enforced in auth (role:assign / user:manage + DB actor re-check + last-admin lock for role change and ban). The admin-service and UI checks are additive. <!-- Red Team: RT-3, RT-15 -->
- <!-- Red Team: RT-2 --> The actor is always the forwarded admin token `sub`; admin-service cannot act as another admin or as a service on these RPCs.
- `reason` is stored as plain text, rendered escaped (React default). Max 500.
- Lists expose emails → only behind `role:assign`. History keeps email snapshots (no FK) for audit permanence.
- No direct `User` writes remain in admin-service for roles, admin flag, or ban status, so every authz-relevant change bumps `authzVersion` and reaches the gateway (fast path + durable event). <!-- Red Team: RT-3 -->

## Next Steps
- Unblocks 09 (switch `AdminRoute` to permissions, `/admin/roles` guarded by `role:assign`), 10 (admin-users list → `ListUsers`, profile edit → `UpdateUserAdmin`; ban already on `SetUserStatus`). <!-- Red Team: RT-3 -->
- Resolved (reconciliation X1): `SetUserStatus` is implemented here only. P04 has no interim ban, P05 has no ban logic, P10 does not implement or verify `SetUserStatus`. <!-- Reconcile: X1 -->
- [CROSS-PHASE] `kmaedu-fe/src/routes/index.tsx` is shared with 07. Register `/admin/roles` only after 07 merges (lead to serialise if 07/08 run in parallel).
- [CROSS-PHASE] `/admin/users` still reads `User` directly (DB). Phase 10 should converge it on auth `ListUsers` (same shape as `/admin/roles/users`) to remove the duplicate list path.
- [CROSS-PHASE] Optional: add `public/locales/ja/admin.json` (all admin pages, not just roles) in a later i18n pass.

### Deferred / carried (closed 2026-10-20)
1. P09: `AdminRoute.tsx` and `SideBar.tsx` still read `user.isAdmin`, which login/me no longer return, so admins are redirected until P09 lands.
2. P09: `AdminAuditPage` labels for `admin.role.set_base` and `admin.role.set_system_admin` are missing.
3. P09: FE vitest for `src/lib/admin-roles/*` (pure rules).
4. P09: apply [evidence/phase-08/response-shape-changes.md](./evidence/phase-08/response-shape-changes.md) to the FE.
5. `UserTable.tsx` is 286 lines (over the 200-line guideline); split later.
6. `AuditRow.actorId` and finance `userId` are typed `number` in FE; they are strings on the BE.
7. Older role-change e2e suite in auth leaves active admins in the test DB; add cleanup (the phase-08 helper `test/helpers/real-auth-admin.ts` shows the pattern).
8. SECURITY: a real Gmail credential was used once by an e2e run before the mail fix (`libs/common` mail transport is now test-safe). The user was advised to rotate the app password. Confirm rotation.
9. Approved deviation: additive `RoleChange` proto fields `target_email`, `actor_email`, `source` (wire compatible; `buf breaking` clean).
10. Open Todo items (not covered by the phase-08 evidence): FE loading/error states and 409 toast mapping on `/admin/roles`; nav click, `UserDetailDrawer`, and last-admin ban disabled state on `/admin/users`. Overview is Completed; these two Todo lines stay open until verified.
