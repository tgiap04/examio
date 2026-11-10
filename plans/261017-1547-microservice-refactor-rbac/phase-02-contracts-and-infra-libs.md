# Phase 02 — Contracts & Infra Libs

## Context Links
- Brief: [reports/planner-brief.md](./reports/planner-brief.md) (§02, decisions 9, 13)
- Red team: [reports/red-team-changes.md](./reports/red-team-changes.md) RT-1, RT-2, RT-8, RT-11 (authoritative over this file's earlier text)
- Research: [researcher-02](./research/researcher-02-migration-mechanics-report.md) §2 (buf + ts-proto + Python), §7 versions
- ARCHITECTURE.md §6.2 (proto conventions, RPC catalog, status→HTTP map), §8.2 (tree), §11 (ports)
- Scout: [current state](./reports/scout-current-state-report.md) "gRPC / events"

## Overview
- Priority: P1 · Status: Completed (2026-10-18) · Effort: 2.25d <!-- Red Team: RT-1, RT-8 (was 2d: +money/delete contracts, +DeleteObjects server; −ALS middleware, −filter rollout) --> · Depends on: 01
- Make `examio-be/proto/` the single contract source. Generate TS (ts-proto) and Python stubs. Unify ports. Add the `libs/contracts`, `libs/grpc`, `libs/http` skeletons. Move every existing gRPC caller and server onto generated types. Define the idempotent money and delete contracts now so later phases code against them.

## Key Insights
- Current protos: `libs/common/src/protos/{auth,wallet,r2,subscription}.proto` (ocr deleted in 01). Runtime proto-loader plus hand-written TS interfaces. Packages are `auth`, `wallet`, `r2`, `subscription`.
- Callers (verified):
  - exam: `GrpcClientsModule.registerR2Client()` (`exam-service.module.ts:35`, flashcardset/ai/quizset/r2 modules) and finance via `modules/finance-client/finance-client.service.ts`.
  - auth: `registerWalletClient()` (`auth.module.ts:35`, usage [UNVERIFIED] — ARCH P2 calls it unused; delete if no call site) and r2 (`profile.module.ts:14`).
  - ai-service Python: only generated r2 stubs in `apps/ai-service/src/backend/grpc_generated/r2_pb2*.py`; no Python call site (grep `r2_pb2` outside `grpc_generated` → none).
- Auth gRPC (`ValidateToken`, `GetUserInfo`, `CheckPermission`) has no callers (scout). Replace with the target RPC set. Numeric `role` (`auth.proto:28,44`) is dropped.
- R2 already batch-deletes with `DeleteObjectsCommand` (`r2-service.service.ts:207-217`, `deleteDirectory`). `DeleteObjects` reuses it. <!-- Red Team: RT-8 -->
- Ports today: auth gRPC 50051, finance 50053, r2 50054, admin 50056. HTTP ports vary (admin 7006). Target: HTTP 3000 + gRPC 50051 in every container (ARCH §11). Local `yarn dev:all` runs on one host, so local `.env` must keep distinct ports.
- ts-proto: `nestJs=true` ignores `outputServices` (researcher-02 §2). Flags: `nestJs=true,addGrpcMetadata=true,addNestjsRestParameter=true,esModuleInterop=true,env=node,forceLong=string`. Nest still loads `.proto` at runtime, so copy `proto/**` as assets.
- Generated code is not committed (`yarn proto:gen` at build). `libs/contracts/src/generated` is gitignored.

## Requirements
- Functional:
  - `proto/examio/{common,auth,finance,r2,gateway}/v1/*.proto` lint-clean under buf STANDARD.
  - Auth proto `examio.auth.v1.AuthService`: `GetUser`, `GetUsersByIds` (privileged, full user incl. email), `GetPublicProfilesByIds` (`id, username, name, avatar` only), `FindUserByEmail`, `ListUsers`, `SetUserRole`, `SetSystemAdmin`, `SetUserStatus(user_id, is_banned, reason)`, `ListRoleChanges`. `User` message carries `BaseRole role` (enum `BASE_ROLE_UNSPECIFIED=0, STUDENT=1, TEACHER=2`) + `bool is_system_admin`. No numeric role. <!-- Red Team: RT-15, RT-3 -->
  - No request message carries `actor_id`: the actor is always the forwarded token `sub` (enforced in 04). <!-- Red Team: RT-2 -->
  - Finance `examio.finance.v1.WalletService`: <!-- Red Team: RT-1 -->
    - `CreateWallet`, `GetWallet`;
    - `Debit(user_id, amount, reason, idempotency_key)`, `Credit(user_id, amount, reason, idempotency_key)`, `Refund(debit_idempotency_key, reason)` → `{ transaction, already_applied: bool }`. Contract only here; server returns `UNIMPLEMENTED` until phase 10.
    - `UpdateBalance` kept, marked `option deprecated = true;` (same semantics as today) for the current exam caller. Phase 10 switches the caller to `Debit` and deletes it.
  - `SubscriptionService.GetUserBenefits`.
  - R2: `examio.r2.v1.R2Service` (existing 4 RPCs) + `DeleteObjects(keys[]) → { deleted_count }`, idempotent (missing keys are success), implemented here. <!-- Red Team: RT-8 -->
  - Gateway: `examio.gateway.v1.GatewayControl` (`RevokeSession(sid, exp)`, `InvalidateUser(user_id, authz_version)`, `SetPageFlags(flags)`). Contract only here; server in 05. <!-- Red Team: RT-3 -->
  - All Nest gRPC servers bind `0.0.0.0:${GRPC_PORT:-50051}`. HTTP binds `${PORT:-3000}`.
  - `libs/grpc` `GrpcClientModule.register({ name, pkg, protoFile, urlEnv })`:
    - default deadline 3s (override per call);
    - retry with backoff on `UNAVAILABLE` (max 2) **only** for RPCs in `IDEMPOTENT_RPCS` (`libs/grpc/src/idempotent-rpcs.ts`, explicit `"<pkg>.<Service>/<Method>"` list: every `Get*`/`List*`/`Find*`, `WalletService/{Debit,Credit,Refund}` (key-guarded), `R2Service/DeleteObjects`, `GatewayControl/*`). Everything else, including `UpdateBalance` and `UploadFile`, is never retried; <!-- Red Team: RT-1 -->
    - metadata is an **explicit** `metadata` parameter on every generated-client wrapper call (`authorization`, `x-request-id`). No AsyncLocalStorage, no request-context middleware. Phase 04 adds the user-token and service-token metadata builders; <!-- Red Team: RT-2 -->
    - maps gRPC status → HTTP exception per ARCH §6.2 table.
  - `libs/http`: `HttpErrorEnvelopeFilter` → `{ statusCode, code, message, requestId }`. `code` is UPPER_SNAKE (default from the status). Built and unit-tested here; **not registered** here. Phase 05 registers it in gateway + auth; other services register it when a later phase touches them (phase 08: admin). Until then, services throw `HttpException({ statusCode, code, message })` so `code` reaches clients through Nest's default filter. Existing success shapes stay unchanged. <!-- Red Team: RT-11 -->
- Non-functional: no hand-written gRPC TS interfaces remain. `buf breaking` runs on PRs. Python stubs are generated from the same files.

## Architecture
```
proto/**/*.proto ─ buf lint ─ buf breaking (PR vs base) ─ buf generate ─► libs/contracts/src/generated (ts-proto)
                                         └─ python -m grpc_tools.protoc ─► apps/ai-service/src/backend/grpc_generated
service code ─► clients/<x>.client.ts (explicit metadata arg) ─► libs/grpc ClientGrpc (deadline, allowlisted retry, error map) ─► <svc>-service:50051
```
- `proto/buf.yaml`: `version: v2`, `modules: [{path: .}]`, `lint: {use: [STANDARD]}`, `breaking: {use: [FILE]}`. `buf.gen.yaml` per researcher-02 §2 (local plugin `../node_modules/.bin/protoc-gen-ts_proto`).
- Each Nest gRPC controller uses the generated `@<Svc>ServiceControllerMethods()` and implements `<Svc>ServiceController`.
- Metadata (decision 9, simplified): callers pass `metadata` explicitly, e.g. `this.finance.getWallet({ userId }, md)`. A wrapper without the arg does not compile. Server-side verification of the token lands in 04 (`libs/auth-jwt`). <!-- Red Team: RT-2 -->
- Idempotency is decided by the lib-side `IDEMPOTENT_RPCS` allowlist (no custom proto option: ts-proto would need extra codegen for options; KISS). A unit test asserts every listed name exists in the generated service definitions. <!-- Red Team: RT-1 -->
- Not-yet-implementable RPCs return `UNIMPLEMENTED`: auth `SetUserRole`, `SetSystemAdmin`, `ListRoleChanges`, `GetPublicProfilesByIds` until 04, `SetUserStatus` until 08 <!-- Reconcile: X1 -->; finance `Debit`, `Credit`, `Refund` until 10. `ListUsers`/`GetUsersByIds` map `isAdmin → is_system_admin`, `role = STUDENT` until 04. <!-- Red Team: RT-1, RT-3, RT-15 -->

## Related Code Files
File ownership (globs): `examio-be/proto/**`, `examio-be/libs/{contracts,grpc,http}/**`, `examio-be/libs/common/src/{protos/**,grpc/**}`, `examio-be/apps/*/src/main.ts`, `examio-be/apps/auth-service/src/grpc/**`, `examio-be/apps/{finance,r2}-service/src/**/*.grpc.controller.ts`, `examio-be/apps/r2-service/src/{r2-service.controller.ts,r2-service.service.ts}` (gRPC handlers + `deleteObjects`), `examio-be/apps/exam-service/src/modules/{finance-client,r2}/**`, `examio-be/apps/*/src/**/*.module.ts` (client registration lines), `examio-be/apps/ai-service/src/backend/grpc_generated/**`, `examio-be/apps/ai-service/{pyproject.toml,Makefile}`, `examio-be/{package.json,nest-cli.json,tsconfig.json,jest.config.js,.gitignore}`, `examio-be/deploy/{docker-compose.yml,Dockerfile}`, `examio-be/apps/*/.env.example`, `/.github/workflows/ci.yml` (buf job), `examio-fe/docker-compose.yml` (`BACKEND_URL` default line only). <!-- Red Team: RT-8 --> <!-- Reconcile: X9 -->

- Create:
  - `/Users/tgiap.dev/devs/examio/examio-be/proto/{buf.yaml,buf.gen.yaml}`
  - `/Users/tgiap.dev/devs/examio/examio-be/proto/examio/common/v1/pagination.proto`
  - `/Users/tgiap.dev/devs/examio/examio-be/proto/examio/auth/v1/auth.proto`
  - `/Users/tgiap.dev/devs/examio/examio-be/proto/examio/finance/v1/{wallet,subscription}.proto`
  - `/Users/tgiap.dev/devs/examio/examio-be/proto/examio/r2/v1/r2.proto`
  - `/Users/tgiap.dev/devs/examio/examio-be/proto/examio/gateway/v1/gateway_control.proto`
  - `/Users/tgiap.dev/devs/examio/examio-be/libs/contracts/src/index.ts` (re-exports generated)
  - `/Users/tgiap.dev/devs/examio/examio-be/libs/grpc/src/{index.ts,grpc-client.module.ts,metadata.ts,deadline-retry.ts,idempotent-rpcs.ts,grpc-error-map.ts}` <!-- Red Team: RT-1, RT-2 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/libs/http/src/{index.ts,http-error-envelope.filter.ts}`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/clients/{r2,finance}.client.ts`, `/Users/tgiap.dev/devs/examio/examio-be/apps/auth-service/src/clients/r2.client.ts`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/ai-service/scripts/gen_grpc.sh`
- Modify:
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/auth-service/src/grpc/auth.grpc.controller.ts` (rewrite to generated interface)
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/finance-service/src/modules/wallet/wallet.grpc.controller.ts`, `/Users/tgiap.dev/devs/examio/examio-be/apps/finance-service/src/modules/sepay/subscription.grpc.controller.ts`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/r2-service/src/r2-service.controller.ts` (gRPC handlers + `DeleteObjects`), `/Users/tgiap.dev/devs/examio/examio-be/apps/r2-service/src/r2-service.service.ts` (`deleteObjects(keys)` sharing the `deleteDirectory` batch loop) <!-- Red Team: RT-8 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/finance-client/finance-client.service.ts` (delegate to `clients/finance.client.ts`)
  - every `GrpcClientsModule.register*Client()` call site (exam modules, `auth.module.ts`, `profile.module.ts`)
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/{auth,exam,finance,admin,r2,gateway}-service/src/main.ts` (ports, proto path from `dist/proto`)
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/ai-service/src/backend/grpc_generated/**` (regenerated)
  - `/Users/tgiap.dev/devs/examio/examio-be/{package.json,nest-cli.json,tsconfig.json,jest.config.js,.gitignore}`, `/Users/tgiap.dev/devs/examio/examio-be/deploy/{docker-compose.yml,Dockerfile}`, `/Users/tgiap.dev/devs/examio/.github/workflows/ci.yml`
  - `/Users/tgiap.dev/devs/examio/examio-fe/docker-compose.yml:21` (`BACKEND_URL` default `http://examio-gateway:7000` → `:3000`) <!-- Reconcile: X9 -->
- Delete:
  - `/Users/tgiap.dev/devs/examio/examio-be/libs/common/src/protos/` (all)
  - `/Users/tgiap.dev/devs/examio/examio-be/libs/common/src/grpc/{grpc-clients.module.ts,r2-client.service.ts}` (after callers moved)
  - hand-written gRPC interfaces in `finance-client`/auth grpc dirs [UNVERIFIED exact files — grep `interface .*Service` near gRPC usages]

## Implementation Steps
1. Add devDeps: `ts-proto@2.15.x`, `@bufbuild/buf`. Add scripts:
   - `proto:lint` = `buf lint proto`
   - `proto:gen` = `cd proto && buf generate`
   - `prebuild:all` = `yarn proto:gen`
   Gitignore `libs/contracts/src/generated`.
2. Write the protos. Field names snake_case. `idempotency_key` on `Debit`/`Credit`; `Refund` keys on `debit_idempotency_key`. `ListUsers` request: `query, role filter (optional BaseRole), is_system_admin (optional bool), is_banned (optional bool), page, limit`. `ListRoleChanges` request: `target_user_id (optional), page, limit`. `PublicProfile` message has no `email` field. <!-- Red Team: RT-1, RT-15 -->
3. Run `yarn proto:gen`. Add aliases `@examio/contracts`, `@examio/grpc`, `@examio/http` to `tsconfig.json` and `jest.config.js`.
4. Build `libs/grpc` (explicit-metadata wrappers, `IDEMPOTENT_RPCS`) and `libs/http`. Unit-test the error map table, the retry policy, and the envelope filter. <!-- Red Team: RT-1, RT-2 -->
5. Migrate servers in this order: r2 (incl. `DeleteObjects`) → finance (wallet with `Debit/Credit/Refund` stubs, subscription) → auth. Each uses generated decorators and `protoPath` = `join(__dirname, 'proto/examio/<svc>/v1/<file>.proto')` with `includeDirs: [proto root]` and loader `{ keepCase:false, longs:String, defaults:true, oneofs:true }`. In `nest-cli.json`, add per-project asset `{ include: "../../proto/**/*.proto", outDir: "dist/apps/<svc>/proto" }`. <!-- Red Team: RT-1, RT-8 -->
6. Migrate the TS callers to `clients/<x>.client.ts` on `libs/grpc`, passing metadata explicitly (pre-04: `x-request-id` only). Delete the `libs/common/src/grpc` client module. <!-- Red Team: RT-2 -->
7. Python: `scripts/gen_grpc.sh` runs `python -m grpc_tools.protoc -I ../../proto --python_out --pyi_out --grpc_python_out` for `examio/r2/v1` + `examio/common/v1`. Pin `grpcio`, `grpcio-tools`, `protobuf` together in `pyproject.toml`.
8. Ports:
   - `main.ts` defaults to `PORT=3000`, `GRPC_PORT=50051`.
   - Compose: every service uses container ports 3000/50051. Callers use `<SVC>_GRPC_URL=<svc>-service:50051`. Gateway uses `*_SERVICE_URL=http://<svc>-service:3000`.
   - FE compose `BACKEND_URL` default → `http://examio-gateway:3000` (the gateway container port changes here; host mapping `6369:3000`). <!-- Reconcile: X9 -->
   - `.env.example` per service keeps distinct local ports (e.g. auth 3001/50051, finance 3003/50053) with a comment.
9. CI: add a `buf` job: `bufbuild/buf-action@v1` with lint + `breaking_against` the PR base (researcher-02 §2). Add `yarn proto:gen` before `be-check`.

## Tests
- Write first:
  - `libs/grpc/src/grpc-error-map.spec.ts`: each status → expected HTTP code (table-driven).
  - `libs/grpc/src/deadline-retry.spec.ts`: an allowlisted RPC retries `UNAVAILABLE` twice; `WalletService/UpdateBalance` and `R2Service/UploadFile` are never retried; `INVALID_ARGUMENT` is never retried. <!-- Red Team: RT-1 -->
  - `libs/grpc/src/idempotent-rpcs.spec.ts`: every allowlist entry resolves to a generated method (no typos). <!-- Red Team: RT-1 -->
  - `libs/http/src/http-error-envelope.filter.spec.ts`: `requestId` taken from `x-request-id`.
- Contract tests (in-process gRPC server + generated client):
  - `apps/finance-service/test/wallet.grpc.contract.spec.ts`: `GetWallet` round-trip; `Debit` → `UNIMPLEMENTED`. <!-- Red Team: RT-1 -->
  - `apps/auth-service/test/auth.grpc.contract.spec.ts`: `GetUsersByIds` batch returns input order, unknown ids omitted.
  - `apps/r2-service/test/r2.grpc.contract.spec.ts` (S3 client mocked): `DeleteObjects` with 1 500 keys → 2 batches; a repeat call with already-deleted keys → success. <!-- Red Team: RT-8 -->
- Existing exam finance-client specs keep passing (debit fail-closed behaviour unchanged).

## Todo List
- [x] buf config + proto files lint-clean (incl. Debit/Credit/Refund, DeleteObjects, SetUserStatus, GetPublicProfilesByIds) — evidence: 6 proto files (plan text said "7"; Create list has 6), `proto:lint` exit 0 · <!-- Red Team: RT-1, RT-8, RT-15 -->
- [x] proto:gen + aliases + gitignore — `proto:gen` exit 0; `@examio/{contracts,grpc,http}` aliases in tsconfig + jest; `libs/contracts/src/generated/` gitignored
- [x] libs/grpc (client module, explicit metadata, deadline, allowlisted retry, error map) — 36 tests pass with libs/http <!-- Red Team: RT-1, RT-2 -->
- [x] libs/http error envelope filter (built + tested, not registered) <!-- Red Team: RT-11 -->
- [x] r2 (+DeleteObjects), finance, auth gRPC servers on generated types — r2 7, finance 48, auth 12 tests pass
- [x] TS callers moved to clients/*.client.ts; libs/common grpc + protos deleted — `clients/{r2,finance}.client.ts` (exam), `libs/common/src/{grpc,protos}` absent
- [x] Python stubs regenerated from proto/ — import OK, grpcio 1.71.2 / protobuf 5.29.6
- [x] Ports unified (compose 3000/50051; local env distinct; FE `BACKEND_URL` default `:3000`) — `.env.example` local ports tracked as deferred item 1 <!-- Reconcile: X9 -->
- [x] CI buf lint/breaking + proto:gen before build — `ci.yml` buf job (`breaking_against` PR base), `proto:gen` before be-check and build jobs

## Success Criteria
- `cd examio-be && yarn proto:lint && yarn proto:gen && yarn typecheck && yarn build:all && yarn test`: exit 0.
- `grep -rn "protos/" examio-be/apps examio-be/libs --include=*.ts` → no hits. `grep -rn "50053\|50054\|50056" examio-be/apps/*/src examio-be/deploy/docker-compose.yml` → no hits.
- `grep -rn "AsyncLocalStorage" examio-be/libs/grpc` → none. `grep -rn "actor_id" examio-be/proto` → none. <!-- Red Team: RT-2 -->
- `cd examio-be/apps/ai-service && ./scripts/gen_grpc.sh && ./venv/bin/python -c "from src.backend.grpc_generated.examio.r2.v1 import r2_pb2_grpc"`: exit 0 [UNVERIFIED import path — adjust to generated layout].
- Compose up: exam AI generation still debits credits (manual smoke: one quick-upload as a funded user → balance −5).

## Risk Assessment
- ts-proto output fails under repo `strict` → Medium/Medium. Spike step 3 first (0.25d). Fall back to `useOptionals=messages` / `outputJsonMethods=false` tweaks.
- Proto-loader runtime path differences in webpack builds → assets copied per project. A contract test boots from the `dist` layout in CI.
- Port unification breaks local dev → keep env-driven ports and document them in `.env.example`.
- Python protobuf runtime version mismatch → pin all three packages together.
- Retrying a non-idempotent RPC double-charges → High/Low. Countermove: retry is allowlist-only and `UpdateBalance` is excluded by test; real idempotency arrives with `Debit` (P10). <!-- Red Team: RT-1 -->
- A caller forgets metadata after 04 → the wrapper signature requires the arg, so `tsc` catches it. <!-- Red Team: RT-2 -->

## Rollback
- Revert by service: each server/caller migration is its own commit. The old `libs/common/src/protos` stays in git history and can be restored with its module.
- Ports: compose env only, so revert the compose change.

## Security Considerations
- gRPC stays plaintext on the internal network (mTLS deferred to 17). Ports 50051 are never published to the host.
- Metadata carries the user's bearer or a service token. `libs/grpc` must never log metadata values (redact `authorization`).
- `ListUsers` and `GetUsersByIds` return emails, so they are privileged (04: service token from an allowlisted caller or `user:manage`). `GetPublicProfilesByIds` is the default for display lookups and is the only projection that may be cached. <!-- Red Team: RT-15 -->
- Actor identity never comes from a request body (`actor_id` is absent from every proto). <!-- Red Team: RT-2 -->

## Next Steps
- Unblocks 03 (events proto/envelope), 04 (implements auth RPCs, service tokens, gateway control client), 05 (GatewayControl server), 10 (`Debit/Credit/Refund` server + caller switch, `UpdateBalance` removal). <!-- Red Team: RT-1 -->
- [CROSS-PHASE] `gateway_control.proto` and `ListRoleChanges` are defined here (not listed in the brief's 02 scope) so that 04 can code its clients before the 05 server exists. Phases 04/05/08 rely on this.
- [CROSS-PHASE] The brief says "rewrite 5 protos". `ocr.proto` is deleted in 01, so the 5th is the new `gateway_control.proto`. Finance `ChangeTier` stays for phase 10; `Debit/Credit/Refund` contracts are here, servers in 10. <!-- Red Team: RT-1 -->
- [CROSS-PHASE] `DeleteObjects` is the only delete path the P11+ `r2_delete_tasks` worker uses. <!-- Red Team: RT-8 -->

### Deferred / carried (from phase 02 inspection + temper, 2026-10-18)
1. Per-service `.env.example` keep distinct local gRPC ports 50053/50054 for single-host dev. Criterion "no 50053/50054/50056" is scoped to `src` + compose only. Owner: P02 follow-up / docs sync (P19).
2. r2 `DeleteObjects` has no key ownership/prefix check. MUST be guarded by P04 `@ServiceOnly` before exposure. Owner: P04.
3. P10 must add a test proving `Debit`/`Credit`/`Refund` idempotency-key dedupe (already in `IDEMPOTENT_RPCS`). Owner: P10.
4. Client money guard (whole-number, range) must be added to future `Debit`/`Credit` wrappers. Owner: P10.
5. CI `be-boot` dummy env must track new boot-time required vars (`JWT_SECRET`, `QUIZ_*`, `PAYMENT_*`, `GOOGLE_*`, etc.) as services change. Owner: each phase that adds a required env var.
6. Behaviour change: subscription limits (files per month, AI chat) now enforced after the camelCase fix. Expect quota-blocked requests that previously passed. Owner: P06 QA / release notes.
7. `docs/` and `ARCHITECTURE.md:70` still mention old ports (docs sync). Owner: P19.
