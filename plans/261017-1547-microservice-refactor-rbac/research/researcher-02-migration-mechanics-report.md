# Migration mechanics: NestJS 11 + Python microservice split (researcher-02)

Date 2026-10-17. Scope: 6 mechanics Qs vs ARCHITECTURE.md §4,6,7,8,10. DB reset => fresh `init` migration per service.
Skills: tkm:help, tkm:research, tkm:search-docs activated; search-docs context7 scripts not run. Evidence: official docs (WebFetch), npm/PyPI registries, tarballs of exact versions (adapter-pg 6.19.3, hpm 3.0.7, jose 5/6), local `node_modules` source (@nestjs/cli, @nestjs/microservices, amqp-connection-manager), scratch `prisma generate`.
Tags: [V] verified this session, [K] standard knowledge not re-verified, [?] needs spike.

## 0. Ranked calls

| # | Topic | Call | Why |
|---|---|---|---|
| 1 | Prisma | Stay 6.x (bump 6.19.3). Per-app schema, generator `prisma-client` + `engineType="client"` + `@prisma/adapter-pg`, `?schema=<svc>`. NOT multiSchema | No native engine to bundle; client = plain TS inside service dir => boundary rule trivial |
| 2 | gRPC | ts-proto `nestJs=true,addGrpcMetadata=true,addNestjsRestParameter=true`; buf = lint/breaking/TS gen; `grpc_tools.protoc` = Python | `nestJs=true` ignores `outputServices` [V] |
| 3 | Outbox | Hand-rolled ~120 lines in `libs/messaging`; per-delay TTL retry queues + republish | confirm channels default in amqp-connection-manager [V] |
| 4 | Gateway | hpm **3.0.7** (not 4.x); one proxy per route + own dispatcher; jose **5.10.0**; custom Redis Lua limiter | hpm 4 needs Node >=22.15 [V]; jose 6 ESM-only [V] |
| 5 | Boundaries/CI | dependency-cruiser `$1` group rule; custom webpack config bundling JS deps; extend existing shell change-detection | Nest default webpack EXTERNALIZES node_modules [V] |
| 6 | Compose | `up -d --no-deps --wait` per service; gateway-a/gateway-b; role-level `search_path`; Redis ACL file | §6 |

Corrections to ARCHITECTURE.md:
1. §6.2 `outputServices=grpc-js, nestJs=true`: drop `outputServices` (ignored).
2. §10.2 "bundle webpack": default Nest webpack does not bundle node_modules; need custom config, else image carries ALL root deps.
3. §10.1 gateway `ports: 6369:3000` blocks 2 replicas; §4.1 says nginx (in kmaedu-fe) fronts it => drop host port.
4. §7.1 `?schema=` alone insufficient at runtime with driver adapter (§1).
5. Node 20 EOL Apr 2026 [K]: use Node 22 LTS images.

## 1. Multiple Prisma clients

Today: `libs/database` merged schema + `prisma-client-js` into node_modules. Both go away.

`apps/<svc>/prisma/schema.prisma`:
```prisma
generator client {
  provider     = "prisma-client"      // GA 6.16; `output` required [V]
  engineType   = "client"             // Rust-free; wasm embedded base64 [V, generated in scratch]
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"                // Nest compiles CJS
}
datasource db { provider = "postgresql"  url = env("DATABASE_URL") }   // url used by migrate
```
Runtime:
```ts
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const u = new URL(process.env.DATABASE_URL!);
const schema = u.searchParams.get('schema') ?? 'public'; u.searchParams.delete('schema');
export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: u.toString(), max: 5 }, { schema }) });
```
Deps: `@prisma/adapter-pg` (same version as prisma), `pg`; keep `@prisma/client` (generated code imports `@prisma/client/runtime/client` + `query_compiler_bg.postgresql(.wasm-base64).js` [V]).

`?schema=` vs multiSchema: multiSchema (GA 6.13 [V]) = ONE Prisma schema spanning several PG schemas (`@@schema`); defeats per-service ownership. Use `?schema=` + one role per service; `migrate deploy` keeps `_prisma_migrations` in that schema [K ~85%, confirm in spike].

Gotchas
- Adapter takes `schema` as 2nd arg (exposed as `schemaName`; Prisma qualifies generated SQL) [V]. `$queryRaw`/`$executeRaw` (outbox) are NOT qualified => `ALTER ROLE <svc>_svc SET search_path = <svc>` in init SQL (§6) or raw SQL hits `public`.
- `migrate dev` needs shadow DB (CREATE DATABASE priv): dev uses superuser URL/`shadowDatabaseUrl`. Prod `migrate deploy` needs none. Migrate role must own its schema.
- Generated client = TS compiled by ts-loader; no `Prisma.validator` (use `satisfies`); no `.env` autoload [V].
- No root `prisma.config.ts` (needed only in Prisma 7) [K]; always pass `--schema`.
- `migrate dev --create-only --name init` per service, commit SQL. Outbox partial index: declare plain `@@index`, hand-edit migration SQL to add `WHERE published_at IS NULL` (drift check compares columns [?]).
- webpack: `engineType=client` => no `.node` engine, no schema copy, no `binaryTargets`. Wasm is a dynamic import => extra chunks unless `LimitChunkCountPlugin({maxChunks:1})` (§5).

Generate all (~13 ms/schema [V]; gitignore `apps/*/src/generated`): script `for s in apps/*/prisma/schema.prisma; do prisma generate --schema $s || exit 1; done`. Docker build stage generates only `$SERVICE`. Delete `@kmaedu/database` mapper in jest.config.js.

Ranking: A > B keep `prisma-client-js` + custom output + copy engines (fallback if adapter-pg regresses) > C multiSchema (reject).

## 2. buf + ts-proto + Python gRPC

ts-proto 2.15.3 [V README]: `nestJs=true` sets outputEncodeMethods/JsonMethods/ClientImpl=false, `lowerCaseServiceMethods=true`, ignores `outputServices`. `addGrpcMetadata=true` => last arg `Metadata` (forward `x-user-id`). `addNestjsRestParameter=true` => trailing `...rest:any` (pass grpc-js `{deadline}`). Nest passes args straight to grpc-js (`client[m](...args)`) for unary and server-streaming [V source]: call `(req, metadata, { deadline })`; pass `new Metadata()` if only a deadline.

`proto/buf.yaml` (v2): `modules: [{path: .}]`, `lint: {use: [STANDARD]}`, `breaking: {use: [FILE]}`.
`proto/buf.gen.yaml` (v2 keys [V]):
```yaml
version: v2
clean: true
plugins:
  - local: ../node_modules/.bin/protoc-gen-ts_proto     # nodeLinker: node-modules => path exists [V]
    out: ../libs/contracts/src/generated
    strategy: all
    opt: [nestJs=true, addGrpcMetadata=true, addNestjsRestParameter=true, esModuleInterop=true, env=node, forceLong=string]
```
Python: do not use buf plugin (grpcio-tools ships protoc, no standalone plugin binary for buf `local`):
```bash
python -m grpc_tools.protoc -I proto --python_out=src/grpc_generated --pyi_out=src/grpc_generated \
  --grpc_python_out=src/grpc_generated $(find proto/kmaedu -name '*.proto' -path '*ai*' -o -path '*common*')
```
Alt: buf remote plugins `buf.build/protocolbuffers/python` + `buf.build/grpc/python` (network/BSR limits [?]). Gotchas: absolute imports => `src/grpc_generated` on PYTHONPATH + `__init__.py`; gencode checks protobuf runtime version => pin grpcio, grpcio-tools, protobuf together (PyPI: 1.84.0/1.84.0/7.36.2) [K]. Replace existing ad-hoc `apps/ai-service/src/backend/grpc_generated`.

Nest still needs `.proto` at runtime (proto-loader via `protoPath`/`package`); ts-proto emits only types/decorators. Copy `proto/` into image; loader `{ keepCase:false, longs:String, defaults:true, oneofs:true, includeDirs:[protoRoot] }` (`forceLong=string` <-> `longs:String`).

Server-streaming Python -> Nest -> SSE. Unsubscribe => `call.cancel()` [V client-grpc.js].
```python
class AiServicer(ai_pb2_grpc.AiServiceServicer):
    async def StreamChat(self, request, context):        # async generator = server-streaming
        try:
            async for tok in agent.astream(request): yield ai_pb2.ChatChunk(text=tok)
        except asyncio.CancelledError: raise              # client cancelled: free LLM call
server = grpc.aio.server(maximum_concurrent_rpcs=64)      # excess => RESOURCE_EXHAUSTED [V]
# SIGTERM: await server.stop(grace=20)
```
```ts
@Post('chat/stream')   // POST => manual SSE (EventSource is GET-only; @Sse() only for GET)
stream(@Body() dto, @Res() res: Response, @CurrentUser() u) {
  res.status(200).set({ 'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no' }).flushHeaders();
  const sub = this.ai.streamChat({ ...dto, userId: u.id }, meta(u)).subscribe({
    next: c => res.write(`data: ${JSON.stringify(c)}\n\n`),
    error: e => { res.write(`event: error\ndata: ${JSON.stringify({ code: e.code })}\n\n`); res.end(); },
    complete: () => res.end() });
  res.on('close', () => sub.unsubscribe());   // -> call.cancel() -> Python CancelledError
}
```
No gzip on this route; 15 s `: hb` heartbeat; idle guard via rxjs `timeout({each: 60_000})`.
`buf breaking` in Actions (`bufbuild/buf-action@v1`; breaking runs on PRs vs PR base; BSR token only for push [V]):
```yaml
# permissions: contents read, pull-requests write; after actions/checkout
- uses: bufbuild/buf-action@v1
  with:
    input: kmaedu-be/proto
    breaking_against: ${{ github.event.repository.clone_url }}#format=git,commit=${{ github.event.pull_request.base.sha }},subdir=kmaedu-be/proto
```
Label `buf skip breaking` bypasses (intentional `v2` package).
Ranking: A > B all-remote buf plugins (network dep) > C proto-loader types only (no contract typing).

## 3. Transactional outbox + RabbitMQ

Model per service (ai mirrors in Alembic):
```prisma
model OutboxEvent {
  seq BigInt @id @default(autoincrement())     // relay order
  id String @unique                             // evt_<ulid> = envelope.id
  type String   envelope Json                   // type = routing key
  attempts Int @default(0)   nextAttemptAt DateTime @default(now())   lastError String?
  createdAt DateTime @default(now())   publishedAt DateTime?
  @@index([publishedAt, nextAttemptAt])         // migration SQL: partial WHERE published_at IS NULL
  @@map("outbox_events")
}
model ProcessedEvent { eventId String @id  processedAt DateTime @default(now())  @@map("processed_events") }
```
Write path: `prisma.$transaction(tx => { business write; outbox.add(tx, type, data) })`. `libs/messaging` stays Prisma-free: `add()` takes a structural `{ outboxEvent: { create } }` param.

Relay (worker role, ONE replica; poll 500 ms; LISTEN/NOTIFY = YAGNI):
```ts
await prisma.$transaction(async tx => {
  const rows = await tx.$queryRaw<Row[]>`SELECT seq::text, id, type, envelope FROM outbox_events
    WHERE published_at IS NULL AND next_attempt_at <= now() ORDER BY seq LIMIT 100 FOR UPDATE SKIP LOCKED`;
  const res = await Promise.allSettled(rows.map(r => channel.publish('kmaedu.events', r.type, r.envelope,
    { persistent: true, messageId: r.id, contentType: 'application/json', headers: { traceparent } })));
  const ok = rows.filter((_, i) => res[i].status === 'fulfilled').map(r => BigInt(r.seq));
  if (ok.length) await tx.$executeRaw`UPDATE outbox_events SET published_at = now() WHERE seq = ANY(${ok})`;
}, { timeout: 15_000, maxWait: 5_000 });     // Prisma default tx timeout 5 s
```
`amqp-connection-manager` 5.0.1: `createChannel({json:true, setup})` uses confirm channel by default (`confirm ?? true`) [V]; `publish` resolves on broker confirm. `seq` BigInt: `$queryRaw` returns bigint (JSON.stringify throws) => cast `::text`. Crash after confirm before commit => duplicate publish => idempotent consumers. Several relays break ordering => events as facts not deltas. Failed rows: attempts+1, backoff `next_attempt_at`, `last_error`. Cleanup published > 7 d; alert on unpublished > 5 min.

Idempotent consumer, same tx as effect:
```ts
await prisma.$transaction(async tx => {
  const n = await tx.$executeRaw`INSERT INTO processed_events(event_id) VALUES (${evt.id}) ON CONFLICT DO NOTHING`;
  if (n === 0) return;           // dup => ack
  await handler(evt, tx);
});
```
Prune rows > 14 d (> retry horizon + DLQ replay window).

Topology (declared idempotently at start; queue args MUST match between Nest and Python or PRECONDITION_FAILED => contract test; mild DRY violation, accept):
- `kmaedu.events`, `kmaedu.dlx` topic durable.
- `<svc>.events` durable: `x-dead-letter-exchange=kmaedu.dlx`, `x-dead-letter-routing-key=<svc>.dlq`.
- Retry: one queue PER delay `<svc>.retry.10s|60s|5m`, `x-message-ttl=<tier>`, `x-dead-letter-exchange=""`, `x-dead-letter-routing-key=<svc>.events`. Per-delay queues because TTL expires only at queue head, so mixed per-message TTLs reorder [V rabbitmq ttl doc].
- Failure: transient => publish to retry tier by `x-retry-count` (confirm) THEN ack; count>=5 or permanent => `nack(requeue=false)` => DLQ. Never `requeue=true` (hot loop [V]).
- Manual ack after DB commit, same channel [V]. Prefetch: ARCH 10-20 right for DB-bound handlers; RabbitMQ docs say 100-300 maximizes throughput for light handlers [V]; start 10, tune.
- Classic durable queues fine on single node; quorum = YAGNI until clustering. DLQ replay: shovel or tiny admin script.

Python aio-pika (repo pins `>=9,<10`; 10.1.1 exists, unreviewed [?]): `connect_robust` (auto-reconnect), `channel.set_qos(prefetch_count=10)`, `declare_queue('ai.events', durable=True, arguments={x-dead-letter-*})` + `bind` per routing key, `queue.consume(on_msg)`. `on_msg`: asyncpg tx { `INSERT INTO processed_events ... ON CONFLICT DO NOTHING RETURNING 1`; if row => handler } then `m.ack()`; transient => republish to retry tier + ack; permanent => `m.reject(requeue=False)`. Publishing uses a confirm channel (aio-pika default [K]).
Heavy OCR: prefetch 1-2, run CPU work in process/thread pool; blocking the loop starves heartbeats and gRPC [V grpc aio doc]. ai-service outbox relay = same SQL via asyncpg.

## 4. Gateway: hpm + YAML + auth + rate limit

Version: hpm `v3-latest` 3.0.7; `latest` 4.2.0 requires Node `^22.15||^24||>=26`, moved to `httpxy` [V npm]. Rank: 3.0.7 > 4.x (after Node 22 + soak; v3->v4 changes NOT researched). v3 API [V tarball README]: `pathFilter`, `on:{proxyReq,proxyRes,error,proxyReqWs,open,close}`, `fixRequestBody`, `router`, `proxyTimeout`, `timeout`, `xfwd`, `ws`.

Wiring (Nest 11 / Express 5):
- `NestFactory.create(AppModule, { bodyParser: false })` mandatory; no compression middleware.
- `app.use(dispatcher)` in main.ts (not `forRoutes('*')`: Express 5 path syntax). Mounted pathless => `req.url` full; `app.use('/api', p)` strips mount [V README].
- Boot: parse YAML (zod) => `Map<routeId,{route,proxy}>`, one `createProxyMiddleware` per route (per-route timeouts). Match: regex `path` first, else longest `prefix`.
```ts
const proxy = createProxyMiddleware({ target: upstreams[r.upstream], xfwd: true, ws: !!r.websocket,
  proxyTimeout: ms(r.timeout ?? '30s'), timeout: ms(r.timeout ?? '30s'),
  on: {
    proxyReq: (pReq, req) => {                       // gateway is the only identity authority
      for (const h of ['x-user-id','x-user-roles']) pReq.removeHeader(h);
      pReq.setHeader('authorization', `Bearer ${req.token}`);   // from cookie or header
      pReq.setHeader('x-request-id', req.id); pReq.setHeader('traceparent', req.traceparent); },
    error: (err, _req, res) => {                     // v3 maps ECONNREFUSED/ENOTFOUND/ECONNRESET/ETIMEDOUT all to 504 [V status-code.js]
      if (res instanceof ServerResponse && !res.headersSent) res.writeHead(code(err) === 'ETIMEDOUT' ? 504 : 502, JSON_HDR).end(envelope());
      else (res as Socket).destroy?.(); } } });  // `res` is a Socket on WS errors
```
- Streaming: http-proxy pipes without buffering; only `selfHandleResponse`/`responseInterceptor` buffer (avoid). SSE route: large/0 timeout; nginx `proxy_buffering off` exists. Body size limit lives at nginx `client_max_body_size`; YAML `maxBodySize` needs explicit content-length check pre-proxy.
- Status/headers/multiple `Set-Cookie` pass verbatim [K]; no `cookieDomainRewrite`. Only auth sets cookies.
- WS: `ws:true` auto-subscribes only after first HTTP request [V README] => explicit handler after `listen`:
```ts
server.on('upgrade', async (req, socket, head) => {   // register after app.listen()
  const m = match(req); if (!m?.route.websocket) return socket.destroy();
  try { await authenticate(req, m.route); await checkPageFlag(m.route.pageFlag); await limiter.hit(key, m.route.rateLimit); m.proxy.upgrade!(req as any, socket as any, head); }
  catch (e) { socket.end(`HTTP/1.1 ${status(e)} X\r\nConnection: close\r\n\r\n`); }
});
```
  ARCH says WS token via `auth.token`: that lives in the socket.io CONNECT packet, NOT visible at HTTP upgrade => lead decision (Unresolved #1).
- jose: pin **5.10.0** (CJS+ESM exports [V]). 6.2.12 is `type: module`, webapi-only [V]: `require()` fails on Node 20 and Jest CJS transform breaks.
```ts
const jwks = createRemoteJWKSet(new URL(AUTH_JWKS_URL), { cooldownDuration: 30_000, cacheMaxAge: 600_000, timeoutDuration: 5_000 });
const { payload } = await jwtVerify(token, jwks, { issuer, audience, algorithms: ['RS256'], clockTolerance: 5 });
```
  Unknown `kid` refetch at most once per cooldown [V v6 source]: publish new `kid` in JWKS BEFORE signing with it. Lazy fetch => gateway boots before auth without crashing.
- Rate limit: `@nest-lab/throttler-storage-redis` 1.2.0 (peer `@nestjs/throttler >=6` [V]) is guard-per-handler; a proxy middleware has no handler => custom (YAGNI, ~25 lines), ioredis + Lua, key `gw:rl:<routeId>:<userId|ip>:<bucket>`:
Lua (atomic): `c=INCR key; if c==1 then PEXPIRE key window end; return {c, PTTL key}`.
  Fixed window (2x burst at boundary; fine). Redis down => fail-open + log. 429 + `Retry-After`. Take client IP from Cloudflare `CF-Connecting-IP` via nginx `real_ip` or keys are spoofable.

## 5. Boundaries, images, CI

dependency-cruiser 18.6.0; `$1` group matching in `pathNot` [V]:
```js
module.exports = { forbidden: [
 { name:'no-app-to-app', severity:'error', from:{ path:'^apps/([^/]+)/' }, to:{ path:'^apps/([^/]+)/', pathNot:'^apps/$1/' } },
 { name:'libs-no-apps', severity:'error', from:{ path:'^libs/' }, to:{ path:'^apps/' } },
 { name:'libs-no-prisma', severity:'error', from:{ path:'^libs/' }, to:{ path:'node_modules/(@prisma|\\.prisma)/|/generated/prisma/' } },
 { name:'no-circular', severity:'error', from:{}, to:{ circular:true } },
], options:{ tsConfig:{ fileName:'tsconfig.json' }, doNotFollow:{ path:'node_modules' } } };
```
(no `includeOnly`: it would hide node_modules edges needed by `libs-no-prisma`.) Run `depcruise apps libs`. Alias resolution via `tsConfig` [K].

Image problem: `@nestjs/cli` default webpack = `externals:[nodeExternals()]` [V webpack-defaults.js]; so `dist` has only app code and node_modules must ship (root package.json = deps of ALL services incl. opencv/tesseract). Repo already sets `webpack:true`, so today's images carry full deps.

| Option | Size | Complexity | Verdict |
|---|---|---|---|
| A. per-project `webpackConfigPath` bundling JS deps [V option exists] | smallest | one shared config | recommended |
| B. full root prod node_modules per image (today) | largest | zero | fallback |
| C. `yarn workspaces focus` per app | small | per-app package.json | reject (YAGNI) |

Defaults already include lazy-import IgnorePlugin and ForkTsChecker [V]; Nest FAQ shows `externals: []` [V]:
```js
// deploy/webpack.service.js
module.exports = (options, webpack) => ({ ...options,
  externals: [/^(tesseract\.js|@techstark\/opencv-js|pg-native)$/],     // start [] and add on build errors
  plugins: [...options.plugins, new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 })] });
```
nest-cli per project: `"webpackConfigPath": "deploy/webpack.service.js"` + `assets` copying `proto/**/*.proto`. `__dirname:false` in Nest defaults => `join(__dirname,'proto')` works [V]. Spike: optional requires (`@nestjs/websockets`, `class-transformer`), `amqplib`, grpc-js bundling [?]. Externals kept => `yarn add --no-save` only those in runtime stage.

`Dockerfile.node` (`ARG SERVICE`): deps (`yarn install --immutable`, BuildKit cache) -> build (`yarn proto:gen`, `prisma generate --schema apps/$SERVICE/...`, `nest build $SERVICE`) -> `node:22-alpine`, copy `dist/apps/$SERVICE`, `USER node`, `HEALTHCHECK wget`, `ROLE` from env. ai-service: own Dockerfile (`python:3.12-slim`, `grpc_tools.protoc` step).

GHCR/CI: `ghcr.io/<owner>/kmaedu-<svc>:<sha>` + `:main`; `GITHUB_TOKEN` with `packages: write`; `docker/build-push-action` `cache-from/to: type=gha,scope=<svc>`.
Change detection: existing deploy.yml diffs `github.event.before..sha` (multi-commit safe) — extend it with `scripts/changed-services.sh`, not `dorny/paths-filter@v4` (matrix from `changes` works [V] but duplicates logic). Rules: `apps/<svc>/**` -> svc; `libs/** | package.json | yarn.lock | tsconfig*.json | deploy/Dockerfile.node | deploy/webpack.service.js` -> ALL node services (KISS; narrow later via `depcruise --reaches` [?]); `proto/kmaedu/<pkg>/**` -> servers+clients of `<pkg>` (10-line map `deploy/services.json`); `apps/ai-service/**`, `proto/kmaedu/ai/**` -> ai-service. Emit JSON => `matrix.service: ${{ fromJSON(needs.detect.outputs.services) }}`; skip when `[]`. PR job per service: `tsc --noEmit -p apps/$SVC/tsconfig.app.json` (verify webpack build fails on type error [?]), lint, jest, `depcruise`, buf lint/breaking, e2e with service containers.

## 6. Compose, Postgres, Redis

Per-service redeploy (`--no-deps`, `--wait`, `--wait-timeout` [V docs]):
```bash
docker compose pull $SVC $SVC-worker $SVC-migrate
docker compose run --rm --no-deps $SVC-migrate            # non-zero exit aborts script
docker compose up -d --no-deps --wait --wait-timeout 90 $SVC $SVC-worker || { set_tag $SVC $PREV; docker compose up -d --no-deps --wait $SVC $SVC-worker; exit 1; }
```
`depends_on` only acts on full `up`. `up` recreates containers without health gating => short blip for single-replica services; callers retry UNAVAILABLE (§6.2). Expand-contract migrations mandatory.

Gateway: recommend two services `gateway-a`, `gateway-b` deployed sequentially with `--wait`; nginx (kmaedu-fe):
```nginx
upstream gw { server gateway-a:3000 max_fails=1 fail_timeout=5s; server gateway-b:3000 max_fails=1 fail_timeout=5s; }
location /api/ { proxy_pass http://gw; proxy_next_upstream error timeout http_502 http_503; proxy_buffering off; proxy_read_timeout 3600s; }
```
nginx resolves upstream hostnames at start; recreated container IP change => `nginx -s reload` after rollout, or use `resolver 127.0.0.11 valid=5s` + variable `proxy_pass` [K]. Alt: `deploy.replicas:2` + scale-up/scale-down script (docker-rollout style, unverified [?]). Graceful: `app.enableShutdownHooks()`, `stop_grace_period: 30s`, readiness 503 on SIGTERM; SSE/WS clients reconnect. Node healthcheck `wget -qO- localhost:3000/health/ready`; Python slim has no wget/curl => `python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/health')"`.

Postgres init (image runs `/docker-entrypoint-initdb.d` ONLY on empty data dir — fine with reset). Use `.sh` so env passwords interpolate:
```bash
#!/bin/bash
set -euo pipefail
for svc in auth finance content assessment studyroom vocabulary aichat document admin ai; do
  pw="${svc^^}_DB_PASSWORD"
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE ROLE ${svc}_svc LOGIN PASSWORD '${!pw}'" \
    -c "CREATE SCHEMA ${svc} AUTHORIZATION ${svc}_svc" -c "ALTER ROLE ${svc}_svc SET search_path = ${svc}"   # search_path: required for raw SQL (§1)
done
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "REVOKE ALL ON SCHEMA public FROM PUBLIC" -c "CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA ai"  # pgvector trusted? [?]
```
Schema names without dashes (`studyroom`). Each role owns only its schema => no cross-service reads without GRANT. Connections: ~12 svc x (api+worker) x pool => pool `max` 5 and `max_connections=200`; PgBouncer = YAGNI. Alembic runs as `ai_svc`, `version_table_schema='ai'`.

Redis 7 ACL file (`--aclfile`), `#<sha256>` hashes (`ACL GENPASS` for secrets) [V]:
```
user default off
user gw_svc      on #<hash> ~gw:*      &gw:*      +@all -@dangerous -@admin +ping +info
user content_svc on #<hash> ~content:* &content:* +@all -@dangerous -@admin +ping +info
```
- `~` guards keys only; Pub/Sub needs `&`; Redis 7 default `resetchannels` [V]. Socket.io redis adapter => grant study-room `&studyroom:*` and set adapter `key:'studyroom'` so channel names match [?].
- `@dangerous` contains INFO, KEYS, CLIENT [V]; ioredis ready check sends `INFO` => `+info` (above) or `enableReadyCheck:false`.
- Key patterns do not restrict FLUSHALL/SWAPDB [V] => `-@dangerous` mandatory.

## 7. Versions [registry 2026-10-17]

prisma 6.16.2 -> use 6.19.3 (latest 8.0.0-rc.23, `prev` 7.10.1) | @prisma/adapter-pg 6.19.3 (peer `pg ^8.11.3`) | hpm 3.0.7 (latest 4.2.0) | jose 5.10.0 (latest 6.2.12) | ts-proto 2.15.x | dependency-cruiser 18.x | amqp-connection-manager 5.0.1 (keep) | grpcio/grpcio-tools/protobuf 1.84.0/1.84.0/7.36.2 (pin together) | aio-pika 9.x (10.1.1 exists) | @nestjs/cli 11.0.21 (`webpackConfigPath` ok [V]).

## 8. Limits
- No spike run: webpack bundle-all with Nest+grpc-js+wasm; adapter-pg runtime perf (Prisma blog claims only); `migrate deploy` `?schema=` history; partial-index drift; ts-proto output under repo `strict`.
- Not researched: hpm v4/httpxy, Prisma 7, aio-pika 10, docker-rollout, pgvector trusted flag, socket.io adapter channel naming. Compose/Redis/Postgres snippets are standard practice, untested on this repo.

## Unresolved questions
1. WS auth: socket.io `auth.token` invisible at HTTP upgrade. Gateway cookie-only + in-service `auth.token` verify, or one-time `?ticket=`? (touches ARCH §4.2/§5)
2. Move images to Node 22 now (Node 20 EOL) and stay on Prisma 6.19.3 (not 7) — confirm scope.
3. `libs/*` change rebuilds ALL node services — acceptable? Gateway `gateway-a/b` vs scale+rollout script?
4. Single relay replica per service OK, or any per-aggregate ordering requirement?
