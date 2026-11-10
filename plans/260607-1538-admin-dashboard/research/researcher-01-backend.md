# Researcher 01 — Backend admin-service patterns

Scope: research only (no code). All decisions in the plan doc are locked; this report maps the existing kmaedu NestJS monorepo patterns that the new `admin-service` will reuse.

## 1. New service skeleton (apps/admin-service)

Pattern matches `apps/auth-service` exactly — see `kmaedu-be/apps/auth-service/src/main.ts:1-55`.

- `apps/admin-service/src/main.ts`:
  - `config({ path: join(process.cwd(), 'apps', 'admin-service', '.env') })` (line 5).
  - `NestFactory.create(AdminServiceModule)` + global prefix `api/v1` (lines 14, 19).
  - Same CORS block as auth/finance (lines 22-29).
  - `connectMicroservice` for gRPC on `process.env.GRPC_PORT || 50056`, proto in `libs/common/src/protos/admin.proto` (lines 32-43).
  - `app.startAllMicroservices()` then `app.listen(process.env.PORT || 7006)` (lines 46-50).
- `apps/admin-service/src/admin-service.module.ts`: thin wrapper, mirrors `auth-service/src/auth-service.module.ts:1-13` (`imports: [DatabaseModule, AdminModule]; controllers: [AdminServiceController, AdminGrpcController]; providers: [AdminServiceService]`).
- `apps/admin-service/src/admin.module.ts`: feature module that imports `DatabaseModule`, `AuthModule` (from `@kmaedu/common` — provides `AuthGuard` + `JwtModule`), `GrpcClientsModule.registerAll()` for inter-service calls, and the six feature modules: `AdminBootstrapModule`, `AdminUsersModule`, `AdminStatsModule`, `AdminFinanceModule`, `AdminLogsModule`, `AdminAuditModule`.
- `nest-cli.json`: add `admin-service` project entry (see `auth-service` block at `kmaedu-be/nest-cli.json:48-66`).
- `package.json` scripts: add `dev:admin` (mirror `dev:auth`).

## 2. AdminGuard (libs/common)

`AuthGuard` already exists at `kmaedu-be/libs/common/src/guard/auth.guard.ts:13-79` and is already exported via `libs/common/src/index.ts:15`. It sets `request.user` (which includes `isAdmin: boolean` per line 38).

- New file: `libs/common/src/guard/admin.guard.ts` — `@Injectable() export class AdminGuard implements CanActivate` that depends on `AuthGuard` (or duplicates its token extraction) and on `PrismaService`. Implementation:
  1. Call AuthGuard-equivalent logic OR extract `request.user` if a global `AuthGuard` APP_GUARD already ran.
  2. Throw `ForbiddenException` if `request.user.isAdmin !== true`.
- Register in `libs/common/src/index.ts:14-17` guard block: `export * from './guard/admin.guard';`
- Apply per-route with `@UseGuards(AdminGuard)` (same decorator used for `AuthGuard` at `kmaedu-be/apps/finance-service/src/modules/wallet/wallet.controller.ts:36`).

## 3. AdminBootstrapService

- Place: `apps/admin-service/src/modules/admin-bootstrap/admin-bootstrap.service.ts` + module.
- Lifecycle: use `OnApplicationBootstrap` (runs after `app.listen()`) — preferred over `OnModuleInit` so DB/Redis are fully ready and parallel startup with HTTP is safer. The plan says `OnModuleInit`; if so, gate DB calls behind `setImmediate` or use `OnApplicationBootstrap` instead. (Repo precedent: `apps/auth-service/src/devices/session-cleanup.cron.ts` is cron-based, no direct precedent for init hooks — pick `OnApplicationBootstrap` for safety.)
- Env reads: `process.env.ADMIN_EMAILS` (CSV, `split(',').map(s => s.trim().toLowerCase()).filter(Boolean)`), `process.env.ADMIN_DEFAULT_PASSWORD`.
- Idempotency: per email, branch on `prisma.user.findUnique({ where: { email } })`:
  - missing → `prisma.user.create({ data: { id: generateId(), email, username: email.split('@')[0]+randomSuffix, name, isAdmin: true, isVerified: true, password: hashed } })` using `PasswordService.hashPassword` from `libs/common/src/services/password.service.ts:7-10` (bcrypt salt 10). If `ADMIN_DEFAULT_PASSWORD` set use it; else use `crypto.randomBytes(24).toString('hex')` and log it.
  - exists && `isAdmin === false` → `prisma.user.update({ where: { id }, data: { isAdmin: true, password: hashed } })`.
  - exists && `isAdmin === true` && `ADMIN_DEFAULT_PASSWORD` set && `!bcrypt.compare(envPwd, user.password)` → update password.
  - exists in DB but not in env → leave alone (per locked decision).
- Wrap in `try/catch` per email; log failures; never throw out of bootstrap.
- Register as `provider` in `AdminBootstrapModule` and import that module into `AdminModule` so it instantiates at startup.

## 4. AdminAudit Prisma model

Insert in `kmaedu-be/libs/database/src/schema.prisma` after the last model. Pattern from `UserSession` (`schema.prisma` line 711) and `Payment` (line 428).

```prisma
model AdminAudit {
    id        String   @id
    adminId   String
    action    String   // e.g. "admin.user.promote", "admin.finance.refund"
    targetId  String?  // userId / paymentId / walletId being acted on
    payload   Json     // request body snapshot
    reason    String?
    ipAddress String?
    userAgent String?
    createdAt DateTime @default(now())

    admin User @relation(fields: [adminId], references: [id], onDelete: Cascade)

    @@index([adminId, createdAt])
    @@index([action, createdAt])
}
```

- Add reverse relation `adminAudits AdminAudit[]` to `User` model (line 618).
- Migration: `cd kmaedu-be && yarn prisma:merge && yarn prisma:migrate --name add_admin_audit && yarn prisma:generate`.

## 5. Log reading + SSE

No existing SSE / `readline` / `fs.watch` in repo (`grep` returned 0 hits under `apps/` and `libs/`). Greenfield:

- `AdminLogsService` in `apps/admin-service/src/modules/admin-logs/`:
  - Config: `LOGS_DIR` env (default `/var/log/kmaedu` in compose, `./logs` locally).
  - `fs.watch(path.join(LOGS_DIR, 'auth-service.log'), { persistent: false })` plus same for `gateway-service.log`.
  - On `change`/`rename` event, read new bytes via `fs.createReadStream(path, { start: lastOffset, end: currSize })` and emit to a `Subject<LogLine>` (use `rxjs` — already in deps via `proxy.service.ts:2`).
  - Redact: regex list for emails (`/[\w.+-]+@[\w-]+\.[\w.-]+/g`), bearer tokens (`/Bearer\s+[\w-.]+/gi`), passwords in JSON bodies (`/"password"\s*:\s*"[^"]*"/gi`). Replace with `[REDACTED]`.
- Controller endpoint:
  ```ts
  @Sse('logs/stream')
  @UseGuards(AdminGuard)
  stream(@Query('service') svc: 'auth-service' | 'gateway-service', @Query('tail') tail='100'): Observable<MessageEvent> {
    return this.logs.stream$(svc, Number(tail)).pipe(map(line => ({ data: line })));
  }
  ```
  `@Sse` decorator is from `@nestjs/common`; `MessageEvent` is the built-in type.
- Initial tail: read last N lines on connect using `readline` over `fs.createReadStream` (count newlines from end) — emit each as a synthetic `change` event, then attach watcher.
- Cleanup: when subject unsubscribes, `fs.unwatchFile` / close watcher. Critical to avoid leaks (perf rule).
- Also expose a non-streaming `GET logs/recent?service=...&limit=...` returning the last N lines for log search UI.

## 6. Refund / credits / tier change — finance integration

Wallet/balance operations already exist:

- `WalletService.deposit` / `deduct` at `apps/finance-service/src/modules/wallet/wallet.service.ts:160-180` — validate positive amount, check balance, delegate to `walletRepository.updateBalance(user.id, amount, 'add'|'subtract')`. **No atomic transaction** — read-then-write race exists. When admin endpoint changes balance, must wrap in `prisma.$transaction([...])` to avoid double-spend under concurrent admin requests.
- gRPC wallet: `WalletService.UpdateBalance` rpc at `libs/common/src/protos/wallet.proto:14`, impl at `apps/finance-service/src/modules/wallet/wallet.grpc.controller.ts:73-122` (`type: 0 = ADD, 4 = SUBTRACT`).
- `Payment` model at `schema.prisma:428` — status int (`0=unpaid, 1=paid, 2=overdue, 3=cancelled`); refund would set `status: 3` (cancelled) or introduce `4=refunded` (need migration). `expiresAt` + `orderId`/`vaNumber` for SePay.
- Subscription: `apps/finance-service/src/modules/sepay/subscription.grpc.controller.ts` (referenced — not opened). Tier change likely modifies `UserSubscription` (`schema.prisma:657`). Need to confirm exact RPC name during implementation; candidate: add new admin-only RPC `ChangeSubscriptionTier(userId, newTier, adminId)`.

Recommended call path from admin-service to finance:

- **HTTP** via `ProxyService`-style axios call — simpler, no new proto required. Use `HttpService` (already in `gateway.module.ts:4`). Add `finance` to `serviceUrls` map pattern at `apps/gateway-service/src/services/proxy.service.ts:16-20` (extend type to include `'admin'` as target or instantiate own `HttpService`).
- **gRPC** for refund/credit — use `GrpcClientsModule.registerWalletClient()` (existing at `libs/common/src/grpc/grpc-clients.module.ts:23-43`) + `Inject(WALLET_SERVICE)`. Add new proto `admin.proto` with `RefundPayment(paymentId, reason)` and `AdminAdjustBalance(userId, amount, direction, reason)` RPCs to keep finance side backward-compatible.

Race handling: in finance, wrap balance update in `prisma.$transaction(async tx => { const w = await tx.wallet.findUnique(...); if (w.balance < amount && direction==='subtract') throw; await tx.wallet.update(...); await tx.walletTransaction.create(...); })`. Same for refund: lock `payment` row, transition status, write reversal transaction.

AdminAudit: every finance mutation must write one row inside the same handler (admin-service side) with `action`, `targetId=paymentId|userId`, `payload={amount, ...}`, `reason`, `req.ip`, `req.headers['user-agent']`.

## 7. Throttler scope

Current global setup at `apps/gateway-service/src/gateway.module.ts:50-55, 91-94`:
- `ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])` + `APP_GUARD: ThrottlerGuard`.

To scope only to `/api/v1/admin/*` while keeping gateway's global limit, two options:

- **Option A (preferred, less code)**: in admin-service, add its OWN `ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }])` and register `APP_GUARD: ThrottlerGuard`. Gateway still has its own 100/min on all routes including `/api/v1/admin/*` (proxied). Since gateway's throttle fires first (per IP), admin-service limit is the inner backstop. Document this layered approach.
- **Option B (cleaner per-route)**: use `@nestjs/throttler` v6 named throttlers + `@Throttle({ admin: { ttl: 60000, limit: 30 } })` decorator only on admin controllers, leaving other routes unlimited. This requires NOT registering `APP_GUARD: ThrottlerGuard` globally; instead use `@UseGuards(ThrottlerGuard)` per controller.

Recommend **Option B** for admin-service (separate process, no other controllers to protect) — register ThrottlerModule with named `'admin'` config and decorate each admin controller with `@SkipThrottle({ default: true })` then `@Throttle({ admin: { ttl: 60000, limit: 30 } })`. Already in deps (`@nestjs/throttler: ^6.5.0` per `package.json`).

## 8. E2E test pattern

Template at `apps/auth-service/test/jest-e2e.json` and `apps/auth-service/test/app.e2e-spec.ts:1-30`:
- `moduleFileExtensions: [js, json, ts]`, `testEnvironment: node`, `testRegex: ".e2e-spec.ts$"`, `transform: { "^.+\\.(t|j)s$": "ts-jest" }`.
- Test bootstraps `AuthServiceModule` via `Test.createTestingModule({ imports: [AuthServiceModule] }).compile()` then `supertest` against `app.getHttpServer()`.
- Admin e2e will: bootstrap `AdminServiceModule`, set up an admin user (insert directly via `PrismaService`), login → get JWT → call admin endpoints, assert audit row written.

## 9. Other reuse

- `GenerateIdService` from `@kmaedu/common` (used in `auth.module.ts:10`, `wallet.grpc.controller.ts:23`) — generate IDs for `AdminAudit` and any seeded admin user.
- `MailService` (exported at `libs/common/src/index.ts:6`) — for sending bootstrap password to admin email if random.
- `RedisService` / `RedisModule` (global, `libs/redis/src/redis.module.ts:1-9`) — cache admin lookups if needed.
- `EventPublisherService` (exported at `libs/common/src/index.ts:13`) — emit `admin.action.performed` event for downstream observability.

## 10. Gateway admin-proxy.controller.ts

Add at `apps/gateway-service/src/controllers/admin-proxy.controller.ts`, register in `gateway.module.ts` controllers list (line 61-89). Pattern from `WalletProxyController` (`wallet-profile-proxy.controller.ts:30-63`):

```ts
@ApiTags('Admin')
@Controller('admin')
@ApiBearerAuth('access-token')
export class AdminProxyController {
  constructor(private readonly proxyService: ProxyService) {}
  @Get('users') /* forward to ADMIN_SERVICE_URL/api/v1/admin/users */
  @Post('finance/refund') /* ... */
  // etc.
}
```

Add `'admin': process.env.ADMIN_SERVICE_URL || 'http://localhost:7006'` to `serviceUrls` map at `apps/gateway-service/src/services/proxy.service.ts:16-20` and extend the union type on `forward*` method signatures (line 17, 71, 105, 138, 297, etc.).

Add `AdminGuard` inside admin-service controllers — gateway proxy does NOT need to re-check admin (admin-service will reject 403 if not admin, proxy returns that as-is).

## 11. docker-compose

Add `admin-service` block after `auth-service` (search for `auth-service:` in `kmaedu-be/deploy/docker-compose.yml`). Mirror structure: same `build.args.SERVICE_NAME: admin-service`, container_name, depends_on (postgres, redis, rabbitmq), env file. Add shared volume:

```yaml
volumes:
  - kmaedu_logs:/var/log/kmaedu
```

Attach the same volume to `auth-service` and `gateway-service` so admin can read their logs. Define `kmaedu_logs:` at the bottom `volumes:` section.

## Unresolved questions

1. **Refund status code** — extend `Payment.status` enum to add `4=refunded` (requires migration) or reuse `3=cancelled` with `description` field? Decide before phase-04.
2. **Subscription tier change** — confirm exact existing RPC or new RPC in `subscription.proto` for changing a user's tier without going through SePay flow.
3. **Bootstrap lifecycle** — confirm user accepts `OnApplicationBootstrap` over `OnModuleInit` (plan says `OnModuleInit` of `auth-service`, not `admin-service`; but bootstrap is in `admin-service` per locked decision — clarify placement).
4. **Log path in dev** — outside Docker, what does `LOGS_DIR` resolve to? Pinhole or relative `apps/admin-service/logs` for local dev? Need explicit env per environment.
5. **Admin service-to-service auth** — does admin-service trust the JWT forwarded by gateway, or does it need to re-verify via gRPC to auth-service? Recommended: re-verify in `AdminGuard` (uses same `AuthGuard` logic, just adds `isAdmin` check), no extra hop.
6. **Audit retention** — any policy on purging old `AdminAudit` rows? Add TTL job? (Out of scope for v1 but flag.)
7. **Compose service name vs URL** — `ADMIN_SERVICE_URL` default `http://localhost:7006`; gateway container must use `http://admin-service:7006` instead. Confirm env file split.
