---
type: bug
date: 2026-06-07
title: Gateway proxies to wrong ports (AUTH/FINANCE) due to duplicate Service URLs section in .env
---

# Bug — Gateway `Proxy error: ` (empty) on login due to duplicate env section in `apps/gateway-service/.env`

## Symptom

Logging in from the FE UI produces:

```
[ProxyMiddleware] → POST /api/v1/auth/login 200 0ms
[ProxyService] Forwarding POST http://localhost:7001/api/v1/auth/login
[ProxyService] Proxy error:
```

- The forwarding URL is `http://localhost:7001/...` but auth-service HTTP listens on `http://localhost:3001`.
- `Proxy error: ` is followed by an empty string — Axios `error.message` was empty (typical for `ECONNREFUSED` thrown after TCP connect fails before any data exchange).
- FE receives a 502/503 from the gateway.

Same root cause affects other proxied services: `FINANCE_SERVICE_URL=http://localhost:7003` instead of `:3003` would cause equivalent failures if any finance route is hit.

## Root cause

In the previous session (260607-2202-gateway-enotfound-admin), the fix appended 4 missing service URLs to `apps/gateway-service/.env` without checking for duplicate keys. The final file ended up with **two** `Services URLs` sections:

```dotenv
# ── Top section (existed before) ──
AUTH_SERVICE_URL=http://localhost:3001     # ✅ correct
EXAM_SERVICE_URL=http://localhost:3002     # ✅ correct
FINANCE_SERVICE_URL=http://localhost:3003  # ✅ correct
ADMIN_SERVICE_URL=http://localhost:7006    # ✅ correct
AI_SERVICE_URL=http://localhost:8000/api   # ✅ correct

# ... (JWT, Redis config in between) ...

# ── Bottom section (appended in previous fix) ──
# Downstream service URLs (local dev)
ADMIN_SERVICE_URL=http://localhost:7006
AUTH_SERVICE_URL=http://localhost:7001     # ❌ wrong port
FINANCE_SERVICE_URL=http://localhost:7003  # ❌ wrong port
AI_SERVICE_URL=http://localhost:8000/api
```

When `dotenv` (v17.4.2) loads a single file with duplicate keys, **the last occurrence wins** for that key. So the gateway ended up with:

| Key | Final value | Default service port | Result |
|---|---|---|---|
| `AUTH_SERVICE_URL` | `http://localhost:7001` | 3001 | ❌ ECONNREFUSED |
| `FINANCE_SERVICE_URL` | `http://localhost:7003` | 3003 | ❌ would fail |
| `ADMIN_SERVICE_URL` | `http://localhost:7006` | 7006 | ✅ happened to match |
| `EXAM_SERVICE_URL` | `http://localhost:3002` | 3002 | ✅ only one entry |
| `AI_SERVICE_URL` | `http://localhost:8000/api` | 8000 | ✅ only one entry |

The previous session worked because the admin endpoint was the only one tested, and admin's port happened to match both sections. Once the user tried to log in (auth) or any other service, the bug surfaced.

## Fix

Removed the duplicate bottom section (lines 25 onward) from `apps/gateway-service/.env` so only the canonical top section remains. The file is now 24 lines, ending at the Redis config block.

```bash
sed -i '' '25,$d' apps/gateway-service/.env
```

After cleanup, `apps/gateway-service/.env` ends with:

```dotenv
# Redis configuration
REDIS_HOST=sv.fayedark.com
REDIS_PORT=6379
REDIS_PASSWORD=fayeteam@123
```

Gateway was restarted via `touch apps/gateway-service/src/main.ts` to trigger `nest start --watch` reload.

## Verification

```bash
# Direct port checks (all on their default ports now)
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/v1/health
200   # auth

$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3003/api/v1/health
200   # finance

# Login through gateway
$ curl -s -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"x","password":"y"}'

{"message":"Thông tin đăng nhập không hợp lệ","error":"Bad Request","statusCode":400}
```

The 400 with a proper JSON body is the **expected** response — it means the gateway successfully forwarded to auth-service, which validated the payload and rejected it as invalid credentials. Previously the gateway was failing at TCP connect with empty `error.message`, returning 502/503 with no body.

## Files changed (1)

| File | Change |
|---|---|
| `apps/gateway-service/.env` | Removed duplicate `Services URLs` section (lines 25-32). Canonical values from the top section remain. |

No code or template change required. `apps/gateway-service/.env.example` was already correct in the previous session — only the live `.env` had drifted.

## Prevention

Two lessons:

1. **Never append service URLs to an existing `.env` without first checking for duplicates.** When fixing missing keys, do one of:
   - Use `Edit` / `Read` + `Write` (replace the file fully) to see all existing keys.
   - Run `grep -E "^[A-Z_]+_SERVICE_URL=" apps/gateway-service/.env` first to inventory what's there.

2. **Operational check after every gateway `.env` edit** — run this one-liner to confirm the resolved URLs match each service's default port:

   ```bash
   for svc in AUTH EXAM FINANCE ADMIN AI; do
     url=$(grep -E "^${svc}_SERVICE_URL=" apps/gateway-service/.env | tail -1 | cut -d= -f2)
     port=$(echo "$url" | grep -oE ':[0-9]+' | head -1 | tr -d ':')
     echo "$svc → $url (port $port)"
   done
   ```

   Output for the cleaned file:
   ```
   AUTH → http://localhost:3001 (port 3001)   ✅ matches auth default
   EXAM → http://localhost:3002 (port 3002)   ✅ matches exam default
   FINANCE → http://localhost:3003 (port 3003) ✅ matches finance default
   ADMIN → http://localhost:7006 (port 7006)  ✅ matches admin default
   AI → http://localhost:8000/api (port 8000)  ✅ matches ai default
   ```

## Open questions

None.
