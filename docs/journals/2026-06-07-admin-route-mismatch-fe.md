---
title: "260607-2314-admin-route-mismatch-fe"
session_date: 2026-06-07
plan: none
status: complete
---

# Session Journal — 260607-2314-admin-route-mismatch-fe

## What

Fixed 3 admin-service endpoints returning 404 because admin-service routes didn't match what the FE admin dashboard (`kmaedu-fe/src/apis/adminApi.ts`) calls.

## Root cause

3 route mismatches between FE calls and admin-service controllers:

| FE URL | Admin route | Issue |
|---|---|---|
| `GET /admin/overview` | `GET /admin/stats/overview` | path mismatch |
| `GET /admin/series/:name?range=` | `GET /admin/stats/series?name=&range=&bucket=` | both prefix and path-vs-query mismatch |
| `POST /admin/finance/tier` | `POST /admin/finance/set-tier` | last-segment mismatch |

User noted that requests must go through the gateway (correct), and the FE URL shape is the contract — backend must match.

## Fix

Per user's instruction, fix is on the admin-service side (gateway is already wired correctly). Added thin alias pass-throughs in 2 files + 1 new controller file. Canonical routes kept intact for any internal callers.

### Files

- **NEW** `apps/admin-service/src/modules/admin-stats/admin-stats-fe-routes.controller.ts` — controller at `@Controller('admin')` exposing:
  - `GET /admin/overview` → `AdminStatsService.getOverview()`
  - `GET /admin/series/:name?range=...` → `AdminStatsService.getSeries(name, range)` with whitelisted name validation
- **EDIT** `apps/admin-service/src/modules/admin-stats/admin-stats.module.ts` — register the new controller alongside the existing one
- **EDIT** `apps/admin-service/src/modules/admin-finance/admin-finance.controller.ts` — add `@Post('tier')` alias delegating to existing `setTier()` method

## Verification

```
$ grep "Mapped {/api/v1/admin" /tmp/admin-service.log
Mapped {/api/v1/admin/overview, GET}          ← NEW
Mapped {/api/v1/admin/series/:name, GET}      ← NEW
Mapped {/api/v1/admin/finance/tier, POST}     ← NEW
... (all canonical routes still present)

$ curl http://localhost:3000/api/v1/admin/overview          → 401 (was 404)
$ curl http://localhost:3000/api/v1/admin/series/traffic   → 401 (was 404)
$ curl -X POST http://localhost:3000/api/v1/admin/finance/tier -d '{}' → 401 (was 404)
```

401 (not 200) is correct — AdminGuard from session #4 rejects unauthenticated requests. After FE login + JWT cookie, will become 200.

`yarn tsc --noEmit` no new errors in admin-stats / admin-finance modules.

## Prevention (deferred)

- Generate FE admin client from admin-service OpenAPI schema (already exposed at `/api`) so URL paths cannot drift.
- Pre-commit hook: `grep -rnE "@(Get|Post|Patch|Delete)" apps/admin-service/ | xargs -I{}` and cross-check vs FE callsites.
- Future refactor: collapse alias routes into the canonical controllers (single controller per resource under `/admin` prefix, internal sub-paths `stats/*`).

## Committed

- No — consistent with previous sessions in this thread.

## Next

- (carry to user) FE admin pages should now serve real data after login. Refresh to verify all 6 admin pages (Overview / Stats / Users / Finance / Audit / Logs) work.
- (carry to user) When ready, can commit all 7 sessions' worth of changes. Awaiting your go-ahead per CLAUDE.md.
