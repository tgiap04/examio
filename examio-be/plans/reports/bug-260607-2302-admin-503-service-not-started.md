---
type: bug
date: 2026-06-07
title: All admin API returns 503 — admin-service not started (missing from dev:all + ENABLE_ADMIN_GRPC=true)
---

# Bug — All admin APIs return 503 "Service unavailable"

## Symptom

Every admin API request from the FE returns:
```json
{"statusCode":503,"message":"Service unavailable"}
```

This is the exact body thrown by `apps/gateway-service/src/services/proxy.service.ts`:
```ts
this.logger.error(`Proxy error: ${error.message}`);
throw new HttpException('Service unavailable', 503);
```

The 503 surfaces because the gateway's `Axios.request()` to `http://localhost:7006/...` fails with `ECONNREFUSED` (port 7006 is not listening). Three contributing causes layered on top of each other:

### Cause 1 — admin-service was not started by the dev orchestrator

`yarn dev:all` (defined in `package.json`) runs:
```json
"dev:all": "concurrently \"yarn dev:gateway\" \"yarn dev:auth\" \"yarn dev:exam\" \"yarn dev:finance\" \"yarn dev:r2\" \"yarn dev:ai\""
```

It never includes `yarn dev:admin`. The user ran `yarn dev:all`, so 6 services started, but **admin-service was not in the list** → no process listening on port 7006.

### Cause 2 — When started manually, admin-service crashed on missing `admin.proto`

Once the user (or me in this session) tried to start admin with `yarn dev:admin`, the process crashed with:
```
[Nest] ERROR [Server] ENOENT: no such file or directory,
open '/Users/tgiap.dev/devs/examio/examio-be/libs/common/src/protos/admin.proto'
```

The `apps/admin-service/src/main.ts:30-48` block loads a gRPC microservice **whenever** `ENABLE_ADMIN_GRPC === 'true'`, and looks for `admin.proto`:
```ts
if (process.env.ENABLE_ADMIN_GRPC === 'true') {
    const grpcPort = process.env.GRPC_PORT || '50056';
    app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.GRPC,
        options: {
            package: 'admin',
            protoPath: join(
                __dirname,
                '../../../libs/common/src/protos/admin.proto'
            ),
            ...
        },
    });
}
```

But `libs/common/src/protos/` does **not** contain `admin.proto`. The only proto files in that directory are:
```
auth.proto
ocr.proto
r2.proto
subscription.proto
wallet.proto
```

The author of the admin-service main.ts even left a comment acknowledging this:
> *"Phase 01 ships HTTP-only via the gateway; gRPC proto is intentionally deferred until a real admin RPC contract is defined."*

So `ENABLE_ADMIN_GRPC` should remain `false` until a real proto is added.

### Cause 3 — Live `apps/admin-service/.env` had `ENABLE_ADMIN_GRPC=true` set

`apps/admin-service/.env` (live, working copy) has:
```bash
GRPC_PORT=50056
ENABLE_ADMIN_GRPC=true    # ← wrong; should be false
```

`apps/admin-service/.env.example` correctly shows `ENABLE_ADMIN_GRPC=false`. The live `.env` had drifted from the example.

## Fix

Two surgical changes — no code logic touched.

### Fix 1 — Disable admin gRPC in live env

```bash
sed -i '' 's/ENABLE_ADMIN_GRPC=true/ENABLE_ADMIN_GRPC=false/' apps/admin-service/.env
```

### Fix 2 — Add `yarn dev:admin` to `dev:all` script

```diff
- "dev:all": "concurrently \"yarn dev:gateway\" \"yarn dev:auth\" \"yarn dev:exam\" \"yarn dev:finance\" \"yarn dev:r2\" \"yarn dev:ai\""
+ "dev:all": "concurrently \"yarn dev:gateway\" \"yarn dev:auth\" \"yarn dev:exam\" \"yarn dev:finance\" \"yarn dev:admin\" \"yarn dev:r2\" \"yarn dev:ai\""
```

(inserted between `dev:finance` and `dev:r2` to keep alphabetical grouping roughly intact)

### Fix 3 — Start `yarn dev:admin` immediately

```bash
pkill -f "dist/apps/admin-service"
(nohup yarn dev:admin > /tmp/admin-service.log 2>&1 &)
```

## Verification

```bash
$ lsof -iTCP:7006 -sTCP:LISTEN
node    79494 ... TCP *:afs3-errors (LISTEN)   # 7006 = afs3-errors

$ tail /tmp/admin-service.log
[NestApplication] Nest application successfully started +76ms
🚀 Admin Service HTTP running on port 7006

$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7006/api/v1/health
200

# Admin via gateway — was 503, now 401 (auth required = correct, AdminGuard working)
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/v1/admin/stats/overview
401

$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/v1/admin/users
401

$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/v1/admin/audit
401
```

The shift from **503** (admin-service not reachable) to **401** (admin-service reachable, AdminGuard correctly rejecting unauthenticated request) is the full fix. The 401 will become 200 once the FE sends a valid JWT cookie (post-login).

## Files changed (2)

| File | Change |
|---|---|
| `apps/admin-service/.env` | `ENABLE_ADMIN_GRPC=true` → `false` |
| `package.json` | `dev:all` script now includes `yarn dev:admin` |

## Prevention

1. **`dev:all` script maintenance** — whenever a new `yarn dev:<service>` script is added to `package.json`, the `dev:all` concurrently command should be updated in the same commit. Add a CONTRIBUTING.md note: *"Adding a new dev script? Add it to `dev:all` too."*

2. **`ENABLE_ADMIN_GRPC` default** — the `if (process.env.ENABLE_ADMIN_GRPC === 'true')` guard correctly protects against a missing proto. The risk is only when someone sets the env var to `true` without first creating the proto. Mitigation: rename the env var to `ADMIN_GRPC_PROTO_PATH` and validate it exists at boot — throws on missing file instead of letting Nest's gRPC loader crash with a less helpful ENOENT.

3. **Self-healing env drift** — `apps/admin-service/.env` and `.env.example` drifted apart. Add a CI check (`scripts/check-env-drift.sh`) that diffs live `.env` against `.env.example` and fails the build if any key is missing or differs unexpectedly.

## Open questions

None.
