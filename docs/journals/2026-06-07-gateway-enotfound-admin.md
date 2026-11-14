---
title: "260607-2202-gateway-enotfound-admin"
session_date: 2026-06-07
plan: none
status: complete
---

# Session Journal — 260607-2202-gateway-enotfound-admin

## What

Fixed gateway admin proxy `getaddrinfo ENOTFOUND admin` error caused by missing service URLs in `apps/gateway-service/.env`.

## Root cause

`apps/gateway-service/src/main.ts` only loads `apps/gateway-service/.env` (per codebase pattern — every service has its own `.env` + `main.ts` load call). The actual `.env` (451 bytes) was missing 4 keys:
- `ADMIN_SERVICE_URL`
- `AUTH_SERVICE_URL`
- `FINANCE_SERVICE_URL`
- `AI_SERVICE_URL`

In dev, `process.env.ADMIN_SERVICE_URL` leaked from shell env (root `.env` sourced earlier in user shell), so gateway picked up `http://admin:7006` — a Docker service hostname. Local `yarn dev:gateway` has no DNS entry for `admin` → `ENOTFOUND`.

## Fix

Appended to `apps/gateway-service/.env`:

```bash
# Downstream service URLs (local dev)
ADMIN_SERVICE_URL=http://localhost:7006
AUTH_SERVICE_URL=http://localhost:7001
FINANCE_SERVICE_URL=http://localhost:7003
AI_SERVICE_URL=http://localhost:8000/api
```

Port choice matches each service's own `main.ts` default:
- auth: 3001
- exam: 3002
- finance: 3003
- admin: 7006 (`apps/admin-service/src/main.ts` default)
- ai (Python FastAPI): 8000

Also updated `apps/gateway-service/.env.example` to include all 5 keys (it was missing `ADMIN_SERVICE_URL` and `AI_SERVICE_URL`).

## Verification

```
curl http://localhost:3000/api/v1/admin/series/traffic
→ HTTP 503 (still, but reason changed)
[ProxyService] Forwarding GET http://localhost:7006/api/v1/admin/series/traffic
[ProxyService] Proxy error: connect ECONNREFUSED 127.0.0.1:7006
```

- ✅ `ENOTFOUND admin` → gone
- ✅ Gateway now resolves `localhost:7006` (correct local dev target)
- ⚠️ 503 remains because **admin-service not running** — separate concern; user needs `yarn dev:admin` to start it on port 7006.

## Files changed

| File | Change |
|---|---|
| `kmaedu-be/apps/gateway-service/.env` | Append 4 service URLs |
| `kmaedu-be/apps/gateway-service/.env.example` | Add 2 missing keys, add section header |

## Prevention (deferred)

- Add startup `validateEnv()` in `ProxyService` that throws on missing keys at boot (catches misconfig at startup, not first request).
- Add `CONTRIBUTING.md` note about syncing gateway `.env` when adding a new service URL to `proxy.service.ts`.

## Committed
- No — user said "Không commit".

## Next
- (carry to user) Run `yarn dev:admin` to start admin-service on port 7006, then admin pages should serve real data.
