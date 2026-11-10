# Screens — F014_AdminDashboard

## Screen List

- SCR033: AdminOverviewPage — KPI cards, quick stats, recent activity
- SCR034: AdminStatsPage — time-series charts, user/exam metrics, "Top nguồn" signup-source breakdown card
- SCR035: AdminUsersPage — user table with ban/unban actions; role and admin flag read-only
- SCR037: AdminLogsPage — log viewer with SSE stream + polling fallback
- SCR038: AdminAuditPage — audit log table with filters + export
- SCR044: AdminRolesPage — `/admin/roles` ("Phân quyền"): role assignment, read-only permission matrix, role change history

See `docs/generated/screen-list.md` for full component breakdowns.

## User Journey

1. Admin logs in and lands on `AdminOverviewPage` (SCR033) via the "Trang quản trị" sidebar link (visible only when the session holds `admin:access`).
2. From the sidebar, admin navigates freely between Overview, Stats, Users, Roles, Logs, and Audit — each an independent top-level page, no required sequence. The admin nav lists only the pages whose permission the admin holds (`ADMIN_NAV_PERMISSIONS`: `stats:read`, `user:manage`, `role:assign`, `logs:read`, `audit:read`, ...); opening one without it goes to `/403`.
3. Typical flow for a support case: `AdminUsersPage` (SCR035) → search/select a user → view detail drawer → ban/unban; to change role or admin flag go to `AdminRolesPage` (SCR044).
4. Typical flow for an incident: `AdminLogsPage` (SCR037) → filter by service/level → watch live stream.
5. Any of the above actions can be cross-checked afterward on `AdminAuditPage` (SCR038).

See `business-context.md` § What They Do for the plain-language narrative.
