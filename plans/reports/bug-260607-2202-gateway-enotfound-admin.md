---
type: bug
date: 2026-06-07
title: Gateway admin proxy ENOTFOUND admin (missing service URLs in apps/gateway-service/.env)
---

# Bug — Gateway `Proxy error: getaddrinfo ENOTFOUND admin`

## Symptom
Gateway `ProxyService` logs:

```
[Nest] 68962  - 07/06/2026, 9:58:46 pm   DEBUG [ProxyService] Forwarding GET http://admin:7006/api/v1/admin/series/traffic
[Nest] 68962  - 07/06/2026, 9:58:46 pm   ERROR [ProxyService] Proxy error: getaddrinfo ENOTFOUND admin
```

The 4 admin-series endpoints (`/admin/series/{signups,traffic,revenue}`) plus `/admin/overview` all return 503 because DNS hostname `admin` is unreachable from local dev.

## Root cause

`apps/gateway-service/src/main.ts:5` only loads `apps/gateway-service/.env`:

```ts
config({ path: join(process.cwd(), 'apps', 'gateway-service', '.env') });
```

The actual `apps/gateway-service/.env` (451 bytes) was missing 4 service URLs:
- `ADMIN_SERVICE_URL`
- `AUTH_SERVICE_URL`
- `FINANCE_SERVICE_URL`
- `AI_SERVICE_URL`

Only `EXAM_SERVICE_URL=http://localhost:3002` was present.

In dev, `process.env.ADMIN_SERVICE_URL` happened to leak from the shell env (root `.env` was sourced earlier in the user session), so the code at `apps/gateway-service/src/services/proxy.service.ts:24` picked up `http://admin:7006` — a Docker service hostname. With `nest start gateway-service --watch` running locally, no DNS entry for `admin` exists → `ENOTFOUND`.

Pattern is consistent across services — each has its own `apps/<service>/.env` and `main.ts` loads it. Gateway's `.env` simply had an incomplete set of keys from earlier setup.

## Fix

Appended 4 missing service URLs to `apps/gateway-service/.env`:

```bash
# Downstream service URLs (local dev)
ADMIN_SERVICE_URL=http://localhost:7006
AUTH_SERVICE_URL=http://localhost:7001
FINANCE_SERVICE_URL=http://localhost:7003
AI_SERVICE_URL=http://localhost:8000/api
```

Port choice matches each service's own default port in its `main.ts`:
- `auth-service` default 3001
- `exam-service` default 3002
- `finance-service` default 3003
- `admin-service` default 7006 (`apps/admin-service/src/main.ts`: `process.env.PORT || 7006`)
- `ai-service` (Python FastAPI) 8000

Also updated `apps/gateway-service/.env.example` so future setups get all 5 keys.

## Verification

```
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/v1/admin/series/traffic
503

[ProxyService] Forwarding GET http://localhost:7006/api/v1/admin/series/traffic
[ProxyService] Proxy error: connect ECONNREFUSED 127.0.0.1:7006
```

- ✅ `ENOTFOUND admin` gone — gateway now resolves `localhost:7006`.
- ✅ 503 remains, but because **admin-service is not running** (`yarn dev:admin` not started). Different problem; gateway forwarding itself is correct.

## Files changed

| File | Change |
|---|---|
| `apps/gateway-service/.env` | Append 4 missing service URLs |
| `apps/gateway-service/.env.example` | Add 2 missing keys (`ADMIN_SERVICE_URL`, `AI_SERVICE_URL`) and explicit section header |

## Prevention

The codebase has a **per-service `.env` + per-service `main.ts` load** pattern. Risk: when a new service is added and registered in `ProxyService.serviceUrls`, both the new service's `apps/<svc>/.env` and the gateway's `apps/gateway-service/.env` must be kept in sync.

Mitigation ideas (not implemented; deferred):
- Add a startup `validateEnv()` in gateway that throws if any key in `serviceUrls` is missing — catches misconfig at boot, not at first request.
- Add a `CONTRIBUTING.md` note under `kmaedu-be/` warning that adding a new service URL to `proxy.service.ts` requires updating `apps/gateway-service/.env(.example)`.

## Open questions

None.
