---
title: "260607-2334-admin-500-zod-v4-mismatch"
session_date: 2026-06-07
plan: none
status: complete
---

# Session Journal — 260607-2334-admin-500-zod-v4-mismatch

## What

Fixed admin-service 500 on 3 paginated endpoints (`/admin/users`, `/admin/audit`, `/admin/users?isAdmin=true`) caused by zod v4 / `@nest-zod/z` v2 incompatibility + FE→BE param name mismatch (`size` vs `pageSize`).

## Root cause

Two layers:

1. **zod v4 ↔ @nest-zod/z v2 incompatibility**: `zod@4.3.6` removed `defaultErrorMap` API, but `@nest-zod/z@2.0.0` (latest) still calls `zod.defaultErrorMap()`. When `ZodValidationPipe` runs on any query/body DTO, it throws `TypeError: zod.defaultErrorMap is not a function` → 500. Endpoints without DTO validation didn't hit this code path.

2. **Param name mismatch**: BE DTO uses `.strict()` and accepts `pageSize` only. FE was sending `size=20` → 400 "Unrecognized key(s) in object: 'size'". After fix 1, the 500 became a 400.

## Fix

### BE: downgrade zod + migrate v4 syntax

```diff
- "zod": "^4.0.5"
+ "zod": "^3.23.8"
```

Migrated 3 DTO files (refund.body.ts, credit.body.ts, set-tier.body.ts) from v4 `z.string({ error: 'msg' })` to v3 `z.string({ required_error: 'msg' })`. The `z.enum([...], { error })` pattern became `z.enum([...], { errorMap: () => ({ message }) })`.

### FE: rename `size` → `pageSize` to match BE DTO

- `UserTable.tsx:70` — query param
- `AdminAuditPage.tsx:32` — query param
- `useAdminStore.ts:36,42` — response type def
- `adminApi.ts:47,56` — `ListUsersQuery` / `ListAuditQuery` type def

## Verification

```
$ yarn tsc --noEmit          # both kmaedu-be and kmaedu-fe
exit 0

$ curl .../admin/users?page=1&pageSize=20          → 200
$ curl .../admin/audit?page=1&pageSize=50          → 200
$ curl .../admin/users?isAdmin=true&pageSize=100  → 200

$ curl .../admin/users?page=1&pageSize=20 | jq 'keys'
["page", "pageSize", "rows", "total"]
```

All 3 previously-500 endpoints now return 200 with real data. No more `zod.defaultErrorMap` TypeError in admin-service log.

## Files changed (8)

```
kmaedu-be/package.json                                       (zod v4 → v3)
kmaedu-be/apps/admin-service/src/modules/admin-finance/dto/refund.body.ts
kmaedu-be/apps/admin-service/src/modules/admin-finance/dto/credit.body.ts
kmaedu-be/apps/admin-service/src/modules/admin-finance/dto/set-tier.body.ts
kmaedu-fe/src/components/admin/UserTable.tsx
kmaedu-fe/src/pages/admin/AdminAuditPage.tsx
kmaedu-fe/src/stores/useAdminStore.ts
kmaedu-fe/src/apis/adminApi.ts
```

## Prevention (deferred)

- Pin `zod` to a safe line (`~3.23.0` allowing patches only) until `@nest-zod/z` is updated for v4 compat.
- CI grep for `z.X({ error: '...' })` v4-specific syntax.
- Boot-time smoke test endpoint that round-trips a DTO through `ZodValidationPipe`.

## Committed

- No — consistent with prior sessions in this thread.

## Next

- (carry to user) All 9 sessions of fixes now work end-to-end. Refresh FE admin dashboard — should show real data on Users / Audit pages (in addition to the 6 pages that already worked from prior sessions).
- (carry to user) When ready, can commit all 9 sessions' worth. Awaiting your go-ahead per CLAUDE.md.
