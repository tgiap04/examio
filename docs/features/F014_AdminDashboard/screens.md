# Screens — F014_AdminDashboard

## Screen List

- SCR033: AdminOverviewPage — KPI cards, quick stats, recent activity
- SCR034: AdminStatsPage — time-series charts, user/exam/finance metrics
- SCR035: AdminUsersPage — user table with ban/unban/delete/grant actions
- SCR036: AdminFinancePage — refund history, credit adjustments, tier changes
- SCR037: AdminLogsPage — log viewer with SSE stream + polling fallback
- SCR038: AdminAuditPage — audit log table with filters + export

See `docs/generated/screen-list.md` for full component breakdowns.

## User Journey

1. Admin logs in and lands on `AdminOverviewPage` (SCR033) via the "Trang quản trị" sidebar link (visible only when `user.isAdmin`).
2. From the sidebar, admin navigates freely between Overview, Stats, Users, Finance, Logs, and Audit — each an independent top-level page, no required sequence.
3. Typical flow for a support case: `AdminUsersPage` (SCR035) → search/select a user → view detail drawer → ban/unban or grant/revoke admin.
4. Typical flow for a finance issue: `AdminFinancePage` (SCR036) → locate the payment → open `FinanceActionModal` → process refund/credit/tier change.
5. Typical flow for an incident: `AdminLogsPage` (SCR037) → filter by service/level → watch live stream.
6. Any of the above actions can be cross-checked afterward on `AdminAuditPage` (SCR038).

See `business-context.md` § What They Do for the plain-language narrative.
