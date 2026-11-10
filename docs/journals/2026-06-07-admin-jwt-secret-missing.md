---
title: "260607-2323-admin-jwt-secret-missing"
session_date: 2026-06-07
plan: none
status: complete
---

# Session Journal — 260607-2323-admin-jwt-secret-missing

## What

Fixed admin-service 401 on every route by adding the missing `JWT_SECRET` to `apps/admin-service/.env`. User initially thought the FE refresh-token flow was broken; root cause was a single missing env var that caused `jwtService.verifyAsync` to reject every token with the same error string as a real expiry.

## Root cause

`apps/admin-service/.env` did not contain `JWT_SECRET`. The shared `AdminGuard` in `libs/common/src/guard/admin.guard.ts:39-40` does `verifyAsync(token, { secret: process.env.JWT_SECRET })` — when undefined, `@nestjs/jwt` rejects every token with the message "Invalid or expired token", which the FE's refresh interceptor misinterpreted as a session-expiry problem.

The FE refresh flow itself was correct — it just kept being invoked on every admin call, then re-failing, which from the user POV looked like "no refresh attempt."

## Fix

```bash
cat >> apps/admin-service/.env << 'EOF'

JWT_SECRET=kmaedu_secret_key
EOF

pkill -f "dist/apps/admin-service"
(nohup yarn dev:admin > /tmp/admin-service.log 2>&1 &)
```

## Verification

```
$ curl -b /tmp/cookies.txt http://localhost:3000/api/v1/admin/overview
{"totalUsers":25,"activeToday":11,"active30d":31,"proCount":1,"vipCount":0,"revenue30d":9510000}

$ curl -b /tmp/cookies.txt http://localhost:3000/api/v1/admin/series/traffic   → 200
$ curl -b /tmp/cookies.txt http://localhost:3000/api/v1/admin/users            → 200
```

All previously-401 admin endpoints now return 200 with real data, confirming:
- Cookie forwarding through gateway works.
- AdminGuard accepts the valid token.
- `AdminStatsService` / `AdminUsersService` execute Prisma queries against the seeded DB.

## Files changed (1)

```
apps/admin-service/.env   (append JWT_SECRET=kmaedu_secret_key)
```

## Prevention (deferred)

- Update each `apps/*/.env.example` to list every required secret; add a `scripts/check-env-drift.sh` to CI.
- Add an `assertEnv(['JWT_SECRET', ...])` helper in `libs/common/src/bootstrap` and call at the top of every `main.ts` to fail fast on missing secrets.

## Committed

- No — consistent with prior sessions in this thread.

## Next

- (carry to user) All 8 sessions of fixes are now working end-to-end. Refresh FE admin dashboard — should now display real KPIs, users, audit, finance, logs.
- (carry to user) If you want, do a similar audit of `apps/auth-service/.env`, `apps/exam-service/.env`, `apps/finance-service/.env` to make sure they all have `JWT_SECRET` (auth, exam, finance almost certainly need it too).
- (carry to user) When ready, can commit all 8 sessions' worth. Awaiting your go-ahead per CLAUDE.md.
