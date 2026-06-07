---
title: "260607-2252-gateway-duplicate-env-section"
session_date: 2026-06-07
plan: none
status: complete
---

# Session Journal — 260607-2252-gateway-duplicate-env-section

## What

Fixed gateway login proxy error caused by duplicate `Services URLs` section in `apps/gateway-service/.env` from the previous session's append-only fix.

## Root cause

In session 260607-2202 I appended 4 missing service URLs (ADMIN/AUTH/FINANCE/AI) to `apps/gateway-service/.env` without checking for duplicates. The file already had a `Services URLs` section at the top with correct values (AUTH=3001, FINANCE=3003, ADMIN=7006, etc.).

dotenv 17.4.2 default behavior: when loading one file with duplicate keys, **last occurrence wins**. The bottom section's wrong values (AUTH=7001, FINANCE=7003) overrode the top section's correct values. Gateway forwarded `POST http://localhost:7001/api/v1/auth/login` → ECONNREFUSED → empty `error.message` → 502/503 to FE.

Admin endpoint worked previously only because both sections had `ADMIN_SERVICE_URL=http://localhost:7006` (admin default port).

## Fix

Removed lines 25 onward (duplicate section + extra comment) from `apps/gateway-service/.env`. File now 24 lines ending at the Redis config block.

```bash
sed -i '' '25,$d' apps/gateway-service/.env
touch apps/gateway-service/src/main.ts   # trigger nest --watch reload
```

## Verification

```bash
$ curl http://localhost:3001/api/v1/health   → 200  (auth direct)
$ curl http://localhost:3003/api/v1/health   → 200  (finance direct)
$ curl -X POST http://localhost:3000/api/v1/auth/login -d '{"email":"x","password":"y"}'
{"message":"Thông tin đăng nhập không hợp lệ","error":"Bad Request","statusCode":400}
```

The 400 is the expected validation error from auth-service — proves the gateway successfully forwarded to the correct port. Previously: empty `Proxy error:` + 502/503.

## Files changed (1)

```
apps/gateway-service/.env  (delete lines 25-32, keep canonical section at top)
```

## Prevention (deferred)

Operational check after every gateway `.env` edit:

```bash
for svc in AUTH EXAM FINANCE ADMIN AI; do
  url=$(grep -E "^${svc}_SERVICE_URL=" apps/gateway-service/.env | tail -1 | cut -d= -f2)
  port=$(echo "$url" | grep -oE ':[0-9]+' | head -1 | tr -d ':')
  echo "$svc → $url (port $port)"
done
```

When adding new service URLs, prefer `Edit` (which shows existing content) over `cat >>` to avoid silent duplication.

## Committed

- No — consistent with previous sessions in this thread, awaiting user explicit approval.

## Next

- (carry to user) Verify FE login flow end-to-end (user reported it was failing in the browser; should now succeed modulo credential validity).
- (carry to user) When ready, commit all 4 sessions' worth of changes: admin UI tokens + gateway env (2 fixes) + admin guard modules. Awaiting your go-ahead per CLAUDE.md.
