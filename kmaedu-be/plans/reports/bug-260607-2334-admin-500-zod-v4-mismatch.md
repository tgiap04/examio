---
type: bug
date: 2026-06-07
title: admin-service 500 on 3 paginated endpoints — zod v4 / @nest-zod/z v2 incompatibility
---

# Bug — admin-service 500 on paginated endpoints (zod v4 ↔ @nest-zod/z v2 mismatch)

## Symptom

Three admin endpoints that have `@Query()` DTOs return **500 Internal Server Error** instead of paginated data:

```bash
$ curl -b cookies.txt http://localhost:3000/api/v1/admin/users?page=1&size=20
{"statusCode":500,"message":"Internal server error"}

$ curl -b cookies.txt http://localhost:3000/api/v1/admin/audit?page=1&size=50
{"statusCode":500,"message":"Internal server error"}

$ curl -b cookies.txt http://localhost:3000/api/v1/admin/users?isAdmin=true&size=100
{"statusCode":500,"message":"Internal server error"}
```

Server log:
```
ERROR [ExceptionsHandler] TypeError: zod.defaultErrorMap is not a function
    at Object.extendedErrorMap [as customError] (node_modules/@nest-zod/z/dist/z.js:178:14)
    at Object.finalizeIssue (node_modules/zod/v4/core/util.cjs:595:47)
    at validate (node_modules/nestjs-zod/dist/index.js:59:25)
    at ZodValidationPipe2.transform
```

The other 5 admin endpoints (overview, finance POSTs, logs, series, etc.) all return 200 — only the three with query DTOs fail.

## Root cause

A version mismatch in the validation stack:

| Package | Installed | API it calls | Status |
|---|---|---|---|
| `zod` | 4.3.6 | `safeParse` (v4 API; `defaultErrorMap` was removed) | v4 |
| `nestjs-zod` | 4.3.1 | `require('@nest-zod/z').extendedErrorMap` | depends on v3-shape API |
| `@nest-zod/z` | 2.0.0 | `return zod.defaultErrorMap(issue, context)` | v3-only API |

`@nest-zod/z@2.0.0` is the latest published version. Its published versions (1.0.0, 1.0.1, 2.0.0) **all** call `zod.defaultErrorMap()`, an API removed in zod v4. The package is effectively unmaintained for zod v4.

Every request to an admin endpoint with a `@Query()` DTO triggered `ZodValidationPipe.transform` → `validate` → `@nest-zod/z.extendedErrorMap` → `TypeError: zod.defaultErrorMap is not a function` → 500.

Endpoints without query DTOs (no `ZodValidationPipe` invocation with parsed input that fails) didn't hit this code path and continued to work — that's why only 3 of 8 admin endpoints were broken.

## Fix

Two layers:

### Fix 1 — Downgrade zod to v3 + migrate the few v4-specific DTO syntax usages

```jsonc
// package.json
- "zod": "^4.0.5"
+ "zod": "^3.23.8"
```

Then `yarn install` → yarn.lock now pins `zod@3.25.76`.

Two DTOs used the v4-only `z.string({ error: 'msg' })` / `z.number({ error: 'msg' })` / `z.enum([...], { error: 'msg' })` syntax. v3 uses different keys:

**Before (v4):**
```ts
paymentId: z.string({ error: 'paymentId is required' }).min(1, { message: 'paymentId is required' }),
direction: z.enum(['ADD', 'SUBTRACT'], { error: 'direction must be ADD or SUBTRACT' }),
tier: z.number({ error: 'tier is required' }).int({ message: 'tier must be an integer' }),
```

**After (v3):**
```ts
paymentId: z.string({ required_error: 'paymentId is required' }).min(1, { message: 'paymentId is required' }),
direction: z.enum(['ADD', 'SUBTRACT'], {
    errorMap: () => ({ message: 'direction must be ADD or SUBTRACT' }),
}),
tier: z.number({ required_error: 'tier is required' }).int({ message: 'tier must be an integer' }),
```

Files updated:
- `apps/admin-service/src/modules/admin-finance/dto/refund.body.ts`
- `apps/admin-service/src/modules/admin-finance/dto/credit.body.ts`
- `apps/admin-service/src/modules/admin-finance/dto/set-tier.body.ts`

`grep -rE "z\\.[a-z]+\\(\\{ error:" apps/ libs/` confirmed only those 3 files used the v4 `error` shorthand.

### Fix 2 — Align FE query param name with BE DTO

After Fix 1, the 3 endpoints now respond with **400 Validation failed: "Unrecognized key(s) in object: 'size'"** — the BE DTO uses `.strict()` and accepts `pageSize` only; the FE was sending `size`.

Updated to `pageSize` (BE canonical name, matches the response field too):

- `kmaedu-fe/src/components/admin/UserTable.tsx:70` — `size: pageSize` → `pageSize: pageSize`
- `kmaedu-fe/src/pages/admin/AdminAuditPage.tsx:32` — `{ isAdmin: true, size: 100 }` → `{ isAdmin: true, pageSize: 100 }`
- `kmaedu-fe/src/stores/useAdminStore.ts:36,42` — interface field `size: number` → `pageSize: number`
- `kmaedu-fe/src/apis/adminApi.ts:47,56` — `size?: number` → `pageSize?: number` in `ListUsersQuery` and `ListAuditQuery`

(FE side was a `size` → `pageSize` rename in 4 small files; the alternative of accepting `size` as alias in BE DTO was rejected because the BE response field is also `pageSize` and the FE store type mirrors it.)

## Verification

```bash
$ cd kmaedu-fe && yarn tsc --noEmit
exit 0    # no new errors in admin/* or apis/adminApi

$ curl -b cookies.txt -o /dev/null -w "%{http_code}\n" \
       "http://localhost:3000/api/v1/admin/users?page=1&pageSize=20"
200

$ curl -b cookies.txt -o /dev/null -w "%{http_code}\n" \
       "http://localhost:3000/api/v1/admin/audit?page=1&pageSize=50"
200

$ curl -b cookies.txt -o /dev/null -w "%{http_code}\n" \
       "http://localhost:3000/api/v1/admin/users?isAdmin=true&pageSize=100"
200

# Body shape verification:
$ curl -b cookies.txt "http://localhost:3000/api/v1/admin/users?page=1&pageSize=20" | jq 'keys'
["page", "pageSize", "rows", "total"]
```

All three endpoints now return 200 with real data. Server log no longer shows the `zod.defaultErrorMap` TypeError.

## Files changed (5)

| File | Change |
|---|---|
| `kmaedu-be/package.json` | `zod: ^4.0.5` → `^3.23.8` |
| `kmaedu-be/apps/admin-service/src/modules/admin-finance/dto/refund.body.ts` | `z.string({ error })` → `z.string({ required_error })` |
| `kmaedu-be/apps/admin-service/src/modules/admin-finance/dto/credit.body.ts` | `z.string({ error })` / `z.enum({ error })` → v3 syntax |
| `kmaedu-be/apps/admin-service/src/modules/admin-finance/dto/set-tier.body.ts` | `z.string({ error })` / `z.number({ error })` → v3 syntax |
| `kmaedu-fe/src/components/admin/UserTable.tsx` | query param `size` → `pageSize` |
| `kmaedu-fe/src/pages/admin/AdminAuditPage.tsx` | query param `size` → `pageSize` |
| `kmaedu-fe/src/stores/useAdminStore.ts` | response type `size` → `pageSize` |
| `kmaedu-fe/src/apis/adminApi.ts` | `ListUsersQuery` / `ListAuditQuery` field `size` → `pageSize` |

(8 files total — 4 in admin-be, 4 in admin-fe; only the package.json edit in admin-be crosses module boundaries.)

## Prevention

1. **Pin zod to a version that has full ecosystem support** — zod v3 is still the safe target. v4 is a major rewrite and many companion packages (`nestjs-zod`, `@nest-zod/z`, `drizzle-zod`, etc.) have not yet caught up. The "I'll just upgrade zod to v4" decision made when admin-service was first scaffolded was premature. Add a `peerDependency` warning by pinning `zod: "~3.23.0"` (allow patch updates only) in `package.json`.

2. **Smoke test the validation path during scaffolding** — when adding a new DTO with `ZodValidationPipe`, hit the endpoint with a deliberately-invalid payload (e.g. missing required field) BEFORE declaring the route done. A 200 with empty data means validation silently passed; a 400 means it's working. A 500 means a runtime error in the validation library and the scaffold is broken.

3. **CI grep** — add to pre-commit / CI: `grep -rE "z\\.[a-z]+\\(\\{ error" apps/ libs/ kmaedu-fe/src/` to catch v4-specific zod syntax that would break the build under v3 (or future major versions).

4. **Boot-time smoke** — add a `GET /health/zod` route to admin-service (gated behind `NODE_ENV !== 'production'`) that round-trips a tiny DTO through `ZodValidationPipe` and asserts no `defaultErrorMap` references. Catches this exact failure at boot, not at first user request.

## Open questions

None.
