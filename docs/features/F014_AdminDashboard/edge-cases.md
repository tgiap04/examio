# Edge Cases — F014_AdminDashboard

| Scenario | What Happens | User-Facing Message |
|----------|--------------|---------------------|
| Non-admin user attempts any `/api/v1/admin/*` route | `AdminGuard` rejects with 403 | "Forbidden"; FE sends the user to `/403` (route guard `RequirePermission`) |
| Unauthenticated user visits `/admin/*` | FE `AdminRoute` (`RequirePermission admin:access`) redirects to `/login?from=...`; an admin lacking a page permission (e.g. `role:assign`) is sent to `/403` | Standard login redirect |
| Admin exceeds 30 req/min on admin routes | `ThrottlerModule` returns 429 | Rate-limit error, retry after cooldown |
| Admin bans a user who is currently logged in | auth `SetUserStatus` sets `isBanned`, revokes all sessions, bumps `authzVersion`; refresh is refused (`ACCOUNT_DISABLED`) | User is logged out on next request |
| Admin changes or bans their own account | 403 `CANNOT_CHANGE_OWN_ROLE` / `CANNOT_CHANGE_OWN_STATUS` | FE locks the own row |
| Demoting the last active SYSTEM_ADMIN | 409 `LAST_SYSTEM_ADMIN` | FE disables the switch when `systemAdminCount` is 1 |
| `PATCH /admin/users/:id` with `role`, `isSystemAdmin` or `isBanned` | 400 `VALIDATION_ERROR` (strict body) | Use `/admin/roles` or ban/unban |
| Admin processes a refund for an already-refunded payment | `$transaction` Serializable isolation prevents double-refund race | Error indicating already processed (exact message not confirmed in source) |
| Two admins attempt to finance-adjust the same wallet simultaneously | Serializable transaction isolation forces one to retry/fail rather than corrupt state | Transient error on the losing transaction |
| SSE log stream ticket expires (300s) before use | Ticket is single-use + time-limited; expired ticket rejected | Stream fails to open, admin must re-request a ticket |
| Log output contains a raw email/token/password pattern | Redactor replaces it before returning to the admin's browser | Redacted placeholder shown instead |
| `ADMIN_EMAILS` env var changes on redeploy | `admin-bootstrap` `OnModuleInit` syncs idempotently — grants new admins, does not revoke ones no longer listed | Silent on non-error path |
| Admin tries to grant admin to an email not yet registered | `admin-bootstrap` sync creates the user record; manual `grant <email>` CLI behavior for unregistered emails not fully confirmed in source | Not fully confirmed |
| Audit log query with no matching filters | Empty paginated result returned | Empty state UI on `AdminAuditPage` |
