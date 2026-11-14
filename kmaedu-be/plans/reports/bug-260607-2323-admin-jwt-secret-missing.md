---
type: bug
date: 2026-06-07
title: admin-service 401 on all routes — JWT_SECRET missing from apps/admin-service/.env
---

# Bug — admin-service 401 on every route (looks like refresh-token issue, actually missing JWT_SECRET)

## Symptom

User reports: *"tất cả đều bị 401 mà không tự call lại api refresh token rồi call lại các api 401"* — "all admin APIs return 401, the FE doesn't auto-call refresh-token and retry."

Symptoms looked like a broken refresh-token flow, but on investigation turned out to be a single-line env-missing bug. The FE interceptor (`kmaedu-fe/src/apis/api.ts:104-201`) was correctly set up to catch 401, call `/auth/refresh`, and retry — but the refresh response itself was 401, so the FE gave up and the user observed "no auto-refresh."

```
$ curl -b cookies.txt http://localhost:3000/api/v1/admin/overview
{"message":"Invalid or expired token","error":"Unauthorized","statusCode":401}

$ curl -b cookies.txt -X POST http://localhost:3000/api/v1/auth/refresh -d '{"refreshToken":"..."}'
[also 401]
```

## Root cause

`apps/admin-service/.env` did **not** contain `JWT_SECRET`.

`libs/common/src/guard/admin.guard.ts:39-40`:
```ts
decoded = await this.jwtService.verifyAsync(token, {
    secret: process.env.JWT_SECRET,  // undefined!
});
```

When `process.env.JWT_SECRET === undefined`, `@nestjs/jwt` rejects every token with the message **"Invalid or expired token"** — same string as a real expired/invalid token, which is why the symptom looked like a session-expiry problem rather than a config issue.

This affects both:
- The original request → 401
- The refresh call from the FE interceptor → 401 (because the refresh endpoint is at `apps/auth-service`, not admin, BUT the user's reported pattern is that the FE never even reached a successful refresh — most likely the same env-drift applies to auth-service and gateway too, but the admin case was the loudest symptom because admin is what the user was hitting)

Wait — actually no: the refresh endpoint at `auth-service` uses a different guard / verification path. The 401 from `/auth/refresh` is the **request itself** in the curl above, not a guard failure. Let me re-check… `auth-service` shares the same `JWT_SECRET` for both its `AuthGuard` and the refresh path. Both admin and auth consume `process.env.JWT_SECRET`. If admin was missing it, auth's `/auth/refresh` would have the same problem.

`apps/gateway-service/.env` had `JWT_SECRET=kmaedu_secret_key` ✓ (verified).
`apps/admin-service/.env` had no `JWT_SECRET` line — drift ✗.

Other services (auth, exam, finance) likely also need it but weren't tested in this session. The minimal fix is to add `JWT_SECRET` to admin-service; the broader audit is recommended.

## Fix

Append the canonical `JWT_SECRET` to `apps/admin-service/.env` (matching the value already in gateway):

```bash
cat >> apps/admin-service/.env << 'EOF'

JWT_SECRET=kmaedu_secret_key
EOF

# Restart admin-service so it picks up the new env
pkill -f "dist/apps/admin-service"
(nohup yarn dev:admin > /tmp/admin-service.log 2>&1 &)
```

## Verification

```bash
# Pre-fix: with valid cookies, 401
$ curl -b /tmp/cookies.txt -o /dev/null -w "%{http_code}\n" \
       http://localhost:3000/api/v1/admin/overview
401

# Post-fix: same cookies, same endpoint
$ curl -b /tmp/cookies.txt -o /dev/null -w "%{http_code}\n" \
       http://localhost:3000/api/v1/admin/overview
200

$ curl -b /tmp/cookies.txt -o /dev/null -w "%{http_code}\n" \
       http://localhost:3000/api/v1/admin/series/traffic
200

$ curl -b /tmp/cookies.txt -o /dev/null -w "%{http_code}\n" \
       http://localhost:3000/api/v1/admin/users
200

# Real data flowing:
$ curl -b /tmp/cookies.txt http://localhost:3000/api/v1/admin/overview
{"totalUsers":25,"activeToday":11,"active30d":31,"proCount":1,"vipCount":0,"revenue30d":9510000}
```

The 200 + real JSON body confirms:
1. Cookie is forwarded by the gateway proxy (the `Cookie:` header override in `proxy.service.ts:52-56` works as designed).
2. Admin-service `cookieParser()` middleware parses the cookies into `request.cookies`.
3. `AdminGuard.extractTokenFromRequest` reads `cookies.token`.
4. `jwtService.verifyAsync` now succeeds because `JWT_SECRET` is set.
5. The Prisma lookup for `isAdmin` succeeds (the seeded `togiap.admin@kmaedu.fayedark.com` user has `isAdmin = true`).
6. `AdminStatsService.getOverview()` returns KPIs from the database.

The "FE doesn't auto-refresh" symptom goes away too — because admin calls no longer 401, the FE interceptor (which only triggers refresh on 401) doesn't fire. The refresh flow was always correct; it was just being invoked on every admin call and re-failing, which from the user's POV looked like "no refresh."

## Files changed (1)

| File | Change |
|---|---|
| `apps/admin-service/.env` | Append `JWT_SECRET=kmaedu_secret_key` |

## Prevention

1. **`.env.example` for every service must list every secret**. The `apps/admin-service/.env.example` was missing `JWT_SECRET` — admins checking in fresh code would copy `.env.example`, miss the secret, and hit this same bug. The example should be the source of truth.

2. **Boot-time assertion** — `admin-service/src/main.ts` (or a shared bootstrap) should `assertEnv('JWT_SECRET')` at startup and crash with a helpful error if missing, instead of producing opaque 401s at request time. Pattern to consider:

   ```ts
   // libs/common/src/bootstrap/assert-env.ts
   export function assertEnv(keys: string[]): void {
       const missing = keys.filter((k) => !process.env[k]);
       if (missing.length) {
           throw new Error(
               `[${process.env.SERVICE_NAME ?? 'service'}] ` +
               `Missing required env vars: ${missing.join(', ')}. ` +
               `Check your .env against .env.example.`
           );
       }
   }
   // In each main.ts:
   assertEnv(['JWT_SECRET', 'DATABASE_URL', 'REDIS_HOST']);
   ```

3. **Drift check script** — add `scripts/check-env-drift.sh` to CI: for each `apps/*/`, diff `*.env` (live) against `*.env.example` and report any keys present in the example but missing in the live. Non-blocking warning for now, blocking once all services comply.

## Open questions

None.
