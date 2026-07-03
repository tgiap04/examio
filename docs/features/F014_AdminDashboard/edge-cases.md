# Edge Cases — F014_AdminDashboard

| Scenario | What Happens | User-Facing Message |
|----------|--------------|---------------------|
| Non-admin user attempts any `/api/v1/admin/*` route | `AdminGuard` rejects with 403 | "Forbidden" / redirect to `/k` on FE |
| Unauthenticated user visits `/admin/*` | FE `AdminRoute` guard redirects to `/login` | Standard login redirect |
| Admin exceeds 30 req/min on admin routes | `ThrottlerModule` returns 429 | Rate-limit error, retry after cooldown |
| Admin bans a user who is currently logged in | `isBanned = true` set; user's next auth check should fail (soft-delete pattern) | User is logged out / blocked on next request |
| Admin processes a refund for an already-refunded payment | `$transaction` Serializable isolation prevents double-refund race | Error indicating already processed (exact message not confirmed in source) |
| Two admins attempt to finance-adjust the same wallet simultaneously | Serializable transaction isolation forces one to retry/fail rather than corrupt state | Transient error on the losing transaction |
| SSE log stream ticket expires (300s) before use | Ticket is single-use + time-limited; expired ticket rejected | Stream fails to open, admin must re-request a ticket |
| Log output contains a raw email/token/password pattern | Redactor replaces it before returning to the admin's browser | Redacted placeholder shown instead |
| `ADMIN_EMAILS` env var changes on redeploy | `admin-bootstrap` `OnModuleInit` syncs idempotently — grants new admins, does not revoke ones no longer listed | Silent on non-error path |
| Admin tries to grant admin to an email not yet registered | `admin-bootstrap` sync creates the user record; manual `grant <email>` CLI behavior for unregistered emails not fully confirmed in source | Not fully confirmed |
| Audit log query with no matching filters | Empty paginated result returned | Empty state UI on `AdminAuditPage` |
