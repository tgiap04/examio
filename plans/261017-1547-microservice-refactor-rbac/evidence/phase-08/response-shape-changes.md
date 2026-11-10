# Phase 08 response-shape and contract changes (for P09 FE, P10, P18 mobile)

Gateway paths are under `/api/v1`. Everything below is behind the gateway `admin:access` prefix and a `SYSTEM_ADMIN` token.

## New: role management (`/admin/roles`, admin-service, `role:assign`)

Error envelope on every route: `{ statusCode, code, message, requestId }` (admin-service now registers `HttpErrorEnvelopeFilter`). A bad body/query is `400 VALIDATION_ERROR`; non-admins `403 PERMISSION_DENIED`.

| Route | Request | Response / errors |
|---|---|---|
| `GET /admin/roles` | | `{ roles: [{ key: STUDENT\|TEACHER\|SYSTEM_ADMIN, permissions: string[] }], permissions: string[29] }` (from `ROLE_PERMISSIONS`/`PERMISSIONS`, catalog order) |
| `GET /admin/roles/users?q&role=STUDENT\|TEACHER&isSystemAdmin=true\|false&page&limit<=100` | strict query | `{ data: [{ id, email, username, name, avatar\|null, role, isSystemAdmin, isBanned, isVerified, createdAt(ISO) }], meta: { page, limit, total }, systemAdminCount }`. `systemAdminCount` counts ACTIVE admins (not banned, not deleted) |
| `PUT /admin/roles/users/:id/role` | `{ role: STUDENT\|TEACHER, reason?<=500 }` strict | `200 { user }`; `403 CANNOT_CHANGE_OWN_ROLE`, `404 USER_NOT_FOUND`, `409 ROLE_CHANGE_CONFLICT`. No-op = 200 unchanged, no AdminAudit row (auth still writes a `reapply` log row + event) |
| `PUT /admin/roles/users/:id/system-admin` | `{ isSystemAdmin: boolean, reason?<=500 }` strict | `200 { user }`; also `409 LAST_SYSTEM_ADMIN` |
| `GET /admin/roles/changes?userId&page&limit<=100` | | `{ data: [{ id, targetUserId, targetEmail, actorUserId\|null, actorEmail, fromRole, toRole, fromAdmin, toAdmin, reason\|null, source: admin-ui\|cli\|bootstrap, createdAt }], meta }`, newest first. Ban/unban/re-apply rows have the same role+flag on both sides: `reason` starts with `ban` / `unban` / `reapply` |

AdminAudit actions written after a successful RPC: `admin.role.set_base` `{from,to,reason}`, `admin.role.set_system_admin` `{from,to,reason}`, `admin.user.ban|unban` `{previousIsBanned}` (the audit page labels for the two new `admin.role.*` keys are not in `AdminAuditPage.tsx`, which this phase does not own).

## Removed

- `POST /admin/users/:id/grant-admin` and `POST /admin/users/:id/revoke-admin` (use `PUT /admin/roles/users/:id/system-admin`).
- `isBanned` in `PATCH /admin/users/:id` is now a 400 (strict body), like `isSystemAdmin`/`role`. Every `/admin/users*` body/query refusal is now `400 VALIDATION_ERROR` (same envelope as `/admin/roles*`; it used to be the generic `BAD_REQUEST`).
- FE: `grantAdminApi`, `revokeAdminApi`, i18n keys `users.actions.{grantAdmin,revokeAdmin,grantSuccess,revokeSuccess,grantError,revokeError,cannotRevokeSelf}` and `users.columns.isAdmin`.

## Changed

- `POST /admin/users/:id/ban|unban`: same route and `{ user }` shape, but now `auth SetUserStatus` with the admin's token. New errors: `403 CANNOT_CHANGE_OWN_STATUS`, `409 LAST_SYSTEM_ADMIN` (defence in depth: unreachable over HTTP because an active admin actor implies at least two active admins), `409 ROLE_CHANGE_CONFLICT`. A ban no longer sets `deletedAt` and revokes every session; ban and unban bump `authzVersion` and emit `auth.user.authz_changed {reason:"ban"|"unban"}`. Legacy accounts banned before RBAC (`isBanned` + `deletedAt`) can still be unbanned (unban clears `deletedAt`).
- `GET /admin/users` rows now carry `role` (read-only) and `isSystemAdmin` (no `isAdmin`); the list filter is `isSystemAdmin=true|false`.
- gRPC `RoleChange` (proto, additive): `string target_email = 10; string actor_email = 11; string source = 12;` filled from the RoleChangeLog snapshots. `ListRoleChanges` stays `role:assign` because it now carries emails.
- gRPC `SetUserStatus(user_id, is_banned, reason)` is implemented (`user:manage`, actor = token `sub`, user tokens only).

## FE (for P09)

- `kmaedu-fe/src/apis/adminApi.ts`: `UserRow` = `{ id: string, role, isSystemAdmin, ... }` (no `isAdmin`), `ListUsersQuery.isSystemAdmin`, user ids are strings. `AuditRow.actorId`, `ListAuditQuery.actorId`, finance `userId` stay `number` (P10 / audit work).
- New: `apis/adminRolesApi.ts`, `stores/useAdminRolesStore.ts`, `lib/admin-roles/{role-change-rules,permission-groups}.ts`, `components/admin/roles/*`, `pages/admin/AdminRolesPage.tsx`, route `/admin/roles`, nav item `nav.roles` (AdminLayout). Pure rules to test in P09: `canEditRow`, `canToggleAdmin`, `canBanRow`, `consequenceKeys`, `isDestructive`, `errorMessageKey`, `banErrorKey`, `groupPermissions`, `permissionI18nKey`.
- `AdminRoute.tsx` and `SideBar.tsx` still read `user.isAdmin`, which `/auth/me` and `/auth/login` no longer return: until P09 switches them to `permissions` (`admin:access`), `/admin/*` redirects an admin to `/k` in a real browser. The browser run used a CDP shim to add `isAdmin`.
- `/admin/users` uses `cache + invalidate` (`invalidateUsers/Audit/AdminList`), `adminCount` = cached admin list length (includes banned admins; the server is authoritative).
- Failed role/ban calls use `validateStatus` (every 4xx but 401) + `toApiFailure` from `lib/quiz-practice/api-failure.ts` so `code` survives the shared axios interceptor.
