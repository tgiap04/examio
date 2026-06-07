---
type: bug
date: 2026-06-07
title: Admin-service 404 on FE admin dashboard — 3 route mismatches between FE and backend
---

# Bug — Admin-service 404s on 3 endpoints called by the FE admin dashboard

## Symptom

After the previous session brought admin-service online (no longer 503), the FE admin dashboard hit all 404s. Specifically:

```
GET  /api/v1/admin/overview                 → 404
GET  /api/v1/admin/series/{name}?range=... → 404
POST /api/v1/admin/finance/tier            → 404
```

While other admin endpoints (`/admin/users`, `/admin/audit`, `/admin/finance/refund`, `/admin/finance/credit`, `/admin/logs/*`) all worked.

User clarification: *"hệ thống có gateway service và cần qua đó mới tới được service chính"* — i.e. the FE is correct in routing through the gateway; the mismatch is on the admin-service side.

## Root cause

Three endpoints shipped with a different URL shape than the FE admin dashboard (`examio-fe/src/apis/adminApi.ts`) calls:

| FE URL (adminApi.ts)                              | Admin-service route (controller)               | Status |
|---------------------------------------------------|------------------------------------------------|--------|
| `GET /admin/overview`                             | `GET /admin/stats/overview` (AdminStatsController) | ❌ mismatch |
| `GET /admin/series/{name}?range=...`              | `GET /admin/stats/series?name=...&range=...&bucket=...` (AdminStatsController) | ❌ mismatch (path vs query + path prefix) |
| `POST /admin/finance/tier`                        | `POST /admin/finance/set-tier` (AdminFinanceController) | ❌ mismatch |
| `GET /admin/users`, `PATCH /admin/users/:id`, ... | `GET /admin/users`, `PATCH /admin/users/:id`, ... | ✅ match |
| `GET /admin/audit`                                | `GET /admin/audit`                             | ✅ match |
| `POST /admin/finance/refund`, `/credit`           | `POST /admin/finance/refund`, `/credit`        | ✅ match |
| `GET /admin/logs/recent`, `POST /admin/logs/ticket`, `GET /admin/logs/stream` | same | ✅ match |

The FE was authored against the URL shape it calls; the admin-service controllers drifted when the dashboard implementation expanded the stats and finance surfaces (likely a refactor that put everything under `/stats` and `set-tier` without updating the FE).

The `/admin/series` case is the most interesting: the canonical admin route takes the metric name and range as **query params** (`?name=traffic&range=7d`), while the FE uses a **path param** for the name (`/admin/series/traffic`) and a query param only for the range.

## Fix

Per the user's instruction that the request must go through the gateway (i.e. we are not allowed to change the FE), the fix is on the admin-service side. Added thin pass-through alias routes that match the FE's URL shape, without removing the canonical routes (kept for any internal callers or future SDK).

### Fix 1 — New `AdminStatsFeRoutesController` (`/admin` prefix)

`apps/admin-service/src/modules/admin-stats/admin-stats-fe-routes.controller.ts` (new file):

```ts
@Controller('admin')
@UseGuards(AdminGuard)
@UsePipes(ZodValidationPipe)
@Throttle({ admin: { ttl: 60000, limit: 30 } })
export class AdminStatsFeRoutesController {
    constructor(private readonly adminStatsService: AdminStatsService) {}

    @Get('overview')                        // → /admin/overview
    async getOverview() {
        return this.adminStatsService.getOverview();
    }

    @Get('series/:name')                    // → /admin/series/:name?range=...
    async getSeries(
        @Param('name') name: string,
        @Query('range') range?: '7d' | '30d' | '90d'
    ) {
        if (!ALLOWED_SERIES.includes(name as AllowedSeries)) {
            throw new BadRequestException(
                `Invalid series name '${name}'. Allowed: ${ALLOWED_SERIES.join(', ')}`,
            );
        }
        return this.adminStatsService.getSeries(
            name as AllowedSeries,
            range ?? '30d'
        );
    }
}
```

Whitelists `signups | traffic | revenue` for the `:name` param so a stray request like `/admin/series/foo` gets a clean 400 instead of leaking the underlying Zod validation error.

`apps/admin-service/src/modules/admin-stats/admin-stats.module.ts`:

```diff
 controllers: [
     AdminStatsController,
+    AdminStatsFeRoutesController,
 ],
```

### Fix 2 — Add `tier` alias in `AdminFinanceController`

`apps/admin-service/src/modules/admin-finance/admin-finance.controller.ts`:

```ts
/**
 * Alias for `set-tier` so the FE admin dashboard
 * (which calls `POST /admin/finance/tier`) can hit the same handler.
 * Both routes are kept; the canonical path is `set-tier`.
 */
@Post('tier')
@HttpCode(HttpStatus.OK)
async tier(@Body() body: SetTierBodyDto, @Req() req: AuthedAdminRequest) {
    return this.setTier(body, req);
}
```

Reuses the same `setTier` method body — single source of truth, no logic duplication.

## Verification

```
$ grep "Mapped {/api/v1/admin" /tmp/admin-service.log
Mapped {/api/v1/admin/stats/overview, GET}    ← canonical, kept
Mapped {/api/v1/admin/stats/series, GET}      ← canonical, kept
Mapped {/api/v1/admin/overview, GET}          ← NEW alias
Mapped {/api/v1/admin/series/:name, GET}      ← NEW alias
Mapped {/api/v1/admin/finance/refund, POST}
Mapped {/api/v1/admin/finance/credit, POST}
Mapped {/api/v1/admin/finance/set-tier, POST} ← canonical, kept
Mapped {/api/v1/admin/finance/tier, POST}     ← NEW alias
Mapped {/api/v1/admin/logs/recent, GET}
Mapped {/api/v1/admin/logs/ticket, POST}
Mapped {/api/v1/admin/logs/stream, GET}
Mapped {/api/v1/admin/users, GET}
Mapped {/api/v1/admin/users/:id, GET}
... (rest of users + audit unchanged)

# Via gateway (was 404 across all three)
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/v1/admin/overview
401    # AdminGuard rejects unauth → expected

$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/v1/admin/series/traffic
401    # AdminGuard rejects unauth → expected

$ curl -s -X POST -d '{}' -H "Content-Type: application/json" \
       -o /dev/null -w "%{http_code}\n" \
       http://localhost:3000/api/v1/admin/finance/tier
401    # AdminGuard rejects unauth → expected
```

All three previously-404 endpoints now return **401** (the correct response for a valid route gated by `AdminGuard` — the FE will receive 200 once it sends a JWT cookie post-login).

`yarn tsc --noEmit` produces no new errors in `admin-stats` or `admin-finance` modules (pre-existing errors in `libs/common/services/mail.service.ts` and `libs/database/prisma/seed-dev.ts` are unrelated).

## Files changed (3)

| File | Change |
|---|---|
| `apps/admin-service/src/modules/admin-stats/admin-stats-fe-routes.controller.ts` | **NEW** — controller with `/admin/overview` and `/admin/series/:name` pass-throughs |
| `apps/admin-service/src/modules/admin-stats/admin-stats.module.ts` | Register the new controller |
| `apps/admin-service/src/modules/admin-finance/admin-finance.controller.ts` | Add `@Post('tier')` alias |

## Prevention

1. **OpenAPI contract as source of truth** — admin-service already emits Swagger at `http://localhost:3000/api`. The FE admin client (`adminApi.ts`) is hand-written. Add a contract test or generate the FE client from the OpenAPI schema so URL paths cannot drift. The auth-service already does this for OAuth flows; admin should follow.

2. **Route inventory check** — when adding a new admin feature, list all routes via:
   ```bash
   grep -rnE "@(Get|Post|Patch|Delete|All|Controller)" \
     apps/admin-service/src/modules/*/  \
     | grep -vE "test|spec"
   ```
   and cross-reference with `examio-fe/src/apis/adminApi.ts`. Could be a pre-commit hook.

3. **Single controller per resource** — having two controllers both registering routes under `/admin` is fine but creates indirection. A future refactor could collapse the alias routes into the canonical controllers (e.g. move `@Get('overview')` and `@Get('series/:name')` directly into `AdminStatsController` and have it sit at `@Controller('admin')` with internal prefix `stats/`). Out of scope for this fix.

## Open questions

None.
