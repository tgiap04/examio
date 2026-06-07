---
title: "260607-2302-admin-503-service-not-started"
session_date: 2026-06-07
plan: none
status: complete
---

# Session Journal — 260607-2302-admin-503-service-not-started

## What

Fixed all admin API endpoints returning 503 by (a) including `yarn dev:admin` in `dev:all`, (b) flipping `ENABLE_ADMIN_GRPC` back to `false` in live env, and (c) starting admin-service.

## Root cause (3 layers)

1. **`yarn dev:all` missing `yarn dev:admin`** — user ran `dev:all`, admin-service was never spawned, port 7006 stayed empty.
2. **`ENABLE_ADMIN_GRPC=true` in live `.env`** while `admin.proto` doesn't exist in `libs/common/src/protos/` (comment in main.ts explicitly defers gRPC). When I tried to start admin manually, Nest gRPC loader crashed with `ENOENT: ... admin.proto`.
3. **Drift between `.env` and `.env.example`** — example had `ENABLE_ADMIN_GRPC=false`, live had `true`. Caused by manual edit at some earlier point.

## Fix

```bash
# 1. Disable gRPC in live env (matches example)
sed -i '' 's/ENABLE_ADMIN_GRPC=true/ENABLE_ADMIN_GRPC=false/' apps/admin-service/.env

# 2. Add admin to dev:all
#    (Edit) package.json → "dev:all": concurrently ... + \"yarn dev:admin\"

# 3. Start admin now
pkill -f "dist/apps/admin-service"
(nohup yarn dev:admin > /tmp/admin-service.log 2>&1 &)
```

## Verification

```
$ lsof -iTCP:7006 -sTCP:LISTEN       → PID 79494 listening
$ tail /tmp/admin-service.log        → "Nest application successfully started" + "🚀 ... port 7006"
$ curl localhost:7006/api/v1/health  → 200
$ curl localhost:3000/api/v1/admin/stats/overview → 401  (was 503)
$ curl localhost:3000/api/v1/admin/users           → 401  (was 503)
$ curl localhost:3000/api/v1/admin/audit           → 401  (was 503)
```

The 401 (instead of 200) is the correct, expected behavior: gateway forwards to admin, AdminGuard (from session #4 fix) rejects unauthenticated request. After FE login + JWT cookie, will become 200.

## Files changed (2)

```
apps/admin-service/.env   (ENABLE_ADMIN_GRPC: true → false)
package.json              (dev:all: add yarn dev:admin)
```

## Prevention (deferred)

- CONTRIBUTING.md: "adding a new dev script? add it to dev:all too"
- Rename `ENABLE_ADMIN_GRPC` → `ADMIN_GRPC_PROTO_PATH`; fail fast on missing file at boot
- CI script to diff live `.env` against `.env.example` for env drift

## Committed

- No — consistent with previous sessions in this thread.

## Next

- (carry to user) Verify FE admin pages now show real data after login.
- (carry to user) If you want to enable admin gRPC later, first define `admin.proto` contract, then set `ENABLE_ADMIN_GRPC=true`. The current `if (process.env.ENABLE_ADMIN_GRPC === 'true')` guard is safe.
