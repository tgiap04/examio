# Screens — F015_PageFeatureFlags

## Screen List

- SCR039: AdminPageConfigPage — see `docs/generated/screen-list.md` for full component breakdown.

## User Journey

1. Admin navigates to `/admin/page-config` (admin-only route, guarded by `AdminRoute`).
2. `AdminPageConfigPage` fetches the current flag list (`GET /admin/page-config`) and renders one row per page with a `Switch`.
3. Admin clicks a switch → optimistic UI flips immediately → `PATCH /admin/page-config/:key` fires in the background.
4. On success, the optimistic state is confirmed (no visual change). On failure, the switch reverts and an error message is shown.
5. All other connected clients receive the updated flag map via SSE (`GET /config/stream`) and their navigation/routes update reactively — no page reload needed.

See `business-context.md` § What They Do for the plain-language narrative.
