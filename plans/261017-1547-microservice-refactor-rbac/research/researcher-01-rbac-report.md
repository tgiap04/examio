# RBAC Design Research — NestJS 11 microservices + React 19

Date: 2026-10-17 | Fixed product decisions not re-litigated.
Sources: NestJS guards docs; jose docs (createRemoteJWKSet/RemoteJWKSetOptions); RFC 8725 (JWT BCP); RFC 9068 (JWT access token profile); OWASP Authorization Cheat Sheet; npm registry (`@nestjs/authorization`, `@casl/ability`, `jose`); blogs (weak); repo code; ARCHITECTURE §5.

## 0. TL;DR — ranked calls
| # | Decision | Call |
|---|---|---|
| 1 | Token content | **Roles only** in JWT (`roles` claim, RFC 9068 name). Permissions derived from `ROLE_PERMISSIONS` in `libs/auth-jwt`. |
| 2 | Enforcement | Two global `APP_GUARD`s: `JwtAuthGuard` -> `PermissionsGuard`. **Deny-by-default**; opt-out via `@Public()` / `@Authenticated()`. Ownership = plain service/Prisma `where`, **no CASL**. |
| 3 | Gateway | Authn + staleness + **coarse prefix-level** `permissions:` only. Per-route perms live ONLY in decorators (DRY). |
| 4 | Prisma | `role Role @default(STUDENT)` + `isSystemAdmin Boolean` + `RoleChangeLog`. Last-admin guard = `SELECT ... FOR UPDATE` in tx. |
| 5 | FE | Server returns `permissions[]` in login/refresh/`/me`; `useCan()` reads store. Codegen only the `Permission` union type. |
| 6 | gRPC identity | **Do not trust `x-user-roles` metadata**; forward the access token and re-verify. (Contradicts ARCHITECTURE §5.3.) |

Two conflicts found in ARCHITECTURE.md (flag to lead):
- §5.4 step 2 / §9 flow: "đổi role -> thu hồi mọi session" forces re-login. Fixed decision says client refreshes to get new claims. => role change must call `InvalidateUser` only, **not** `RevokeUserSessions`; refresh handler must re-read role from DB.
- §5.3 trusts gRPC `x-user-roles` metadata (see §6).

## 1. Roles vs permissions in JWT
| Criterion | Roles only + shared map (A) | Permissions array in token (B) |
|---|---|---|
| Token size | ~2 short strings | ~15-30 strings (~400-700 B in cookie + header on every request) |
| Permission-catalog change | Takes effect on deploy for ALL live tokens | Stale up to 15m, needs token reissue |
| Role change | Needs InvalidateUser (already designed) | Same |
| Fixed roles in code (our case) | Natural | Redundant: token duplicates a pure function of `roles` |

Consensus (Open edX authz ADR, Mercoa, multiple blogs; all vendor/blog-grade, no RFC/OWASP mandate): keep token lean, roles in token, high-risk actions re-check fresh data. RFC 9068 §2.2.3.1 says authz data SHOULD use `roles`/`groups`/`entitlements` claim names -> `roles` matches.

**Call: A.** B only if roles become dynamic (YAGNI). Since fixed roles are code, the map is a pure function; deploy-time effect is a feature.

```ts
// verify (shared in libs/auth-jwt) — jose defaults: cooldownDuration 30s, cacheMaxAge 10m, timeoutDuration 5s
const JWKS = createRemoteJWKSet(new URL(process.env.AUTH_JWKS_URL!));
export async function verifyAccessToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, JWKS, {
    algorithms: ['RS256'], issuer: ISS, audience: AUD, typ: 'at+jwt',
  });
  return { id: payload.sub!, sid: payload.sid as string, roles: payload.roles as Role[], iat: payload.iat! };
}
```
Key rotation: publish new `kid` first, sign with it later, retire old after >= 15m. Also validate `typ`/`aud` per token kind (RFC 8725 3.9, 3.11, 3.12).

Semantics decision (recommend, lead to confirm): `SYSTEM_ADMIN` maps ONLY to admin perms (`role:assign`, `user:read`, stats, finance-admin…), NOT a wildcard. An admin who also teaches is `TEACHER + SYSTEM_ADMIN`. Least privilege (OWASP), keeps matrix honest/read-only-displayable.

## 2. `libs/auth-jwt` design

Layout (no Prisma import): `permissions.ts`, `roles.ts` (pure TS, zero Nest deps -> codegen-able), `verify.ts`, `decorators.ts`, `jwt-auth.guard.ts`, `permissions.guard.ts`, `auth-jwt.module.ts` (provides both APP_GUARDs).

Use `as const` object, **not** TS `enum` (shareable to FE, tree-shakes, no runtime enum quirks):
```ts
export const PERMISSIONS = {
  QUIZSET_CREATE: 'quizset:create', QUIZSET_MANAGE: 'quizset:manage',
  FLASHCARD_SET_CREATE: 'flashcard_set:create', FLASHCARD_STUDY: 'flashcard:study',
  EXAM_ROOM_CREATE: 'exam_room:create', EXAM_SESSION_TAKE: 'exam_session:take',
  STUDY_ROOM_CREATE: 'study_room:create', STUDY_ROOM_JOIN: 'study_room:join',
  WORD_FAMILY_VIEW: 'word_family:view', AI_GENERATE: 'ai:generate', AI_CHAT: 'ai:chat',
  WALLET_USE: 'wallet:use', ROLE_ASSIGN: 'role:assign', USER_READ: 'user:read',
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type Role = 'STUDENT' | 'TEACHER' | 'SYSTEM_ADMIN';   // JWT `roles` values
const P = PERMISSIONS;
export const ROLE_PERMISSIONS = {
  STUDENT: [P.FLASHCARD_STUDY, P.EXAM_SESSION_TAKE, P.STUDY_ROOM_JOIN, P.WORD_FAMILY_VIEW],
  TEACHER: [P.QUIZSET_CREATE, P.QUIZSET_MANAGE, P.FLASHCARD_SET_CREATE, P.EXAM_ROOM_CREATE,
            P.STUDY_ROOM_CREATE, P.STUDY_ROOM_JOIN, P.AI_GENERATE, P.AI_CHAT, P.WALLET_USE,
            P.FLASHCARD_STUDY /* own/granted sets */],
  SYSTEM_ADMIN: [P.ROLE_ASSIGN, P.USER_READ],
} as const satisfies Record<Role, readonly Permission[]>;

export const permissionsOf = (roles: readonly Role[]) => { /* union of ROLE_PERMISSIONS, memoized */ };
export const hasPermission = (roles: readonly Role[], ...req: Permission[]) =>
  req.every((p) => permissionsOf(roles).has(p));
```
Note TEACHER lacks `exam_session:take` on purpose (teacher does not take others' exams). Teacher previewing own exam = ownership check in service, not a permission.

Decorators (Nest 11 idiom: `Reflector.createDecorator`, documented in guards docs):
```ts
export const RequirePermissions = Reflector.createDecorator<Permission[]>();   // usage: @RequirePermissions([P.QUIZSET_CREATE]) — AND semantics
export const Public = Reflector.createDecorator<void>();           // anonymous OK; token still parsed if present
export const Authenticated = Reflector.createDecorator<void>();    // any logged-in user (/me, logout)
export const CurrentUser = createParamDecorator((_d, ctx: ExecutionContext) =>
  getRequest(ctx).user as AuthUser);            // getRequest: http -> switchToHttp, rpc -> built from metadata
```
Guards, both registered globally (multiple APP_GUARDs run in registration order — Nest docs):
```ts
@Injectable() export class JwtAuthGuard implements CanActivate {
  constructor(private r: Reflector) {}
  async canActivate(ctx: ExecutionContext) {
    const isPublic = this.r.getAllAndOverride(Public, [ctx.getHandler(), ctx.getClass()]) !== undefined;
    const req = getRequest(ctx); const token = extractToken(req);   // cookie accessToken | Bearer | grpc md 'authorization'
    if (!token) { if (isPublic) return true; throw new UnauthorizedException('TOKEN_MISSING'); }
    try { req.user = await verifyAccessToken(token); }
    catch (e) { if (isPublic) return true; throw new UnauthorizedException(mapJoseError(e)); } // TOKEN_EXPIRED
    return true;
  }
}
@Injectable() export class PermissionsGuard implements CanActivate {
  constructor(private r: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.r.getAllAndOverride(Public, targets) !== undefined) return true;
    const req = this.r.getAllAndOverride(RequirePermissions, targets);
    const authed = this.r.getAllAndOverride(Authenticated, targets) !== undefined;
    if (!req && !authed) throw new ForbiddenException('NO_AUTHZ_DECLARED');   // deny by default (OWASP)
    if (req && !hasPermission(getRequest(ctx).user.roles, ...req)) throw new ForbiddenException('PERMISSION_DENIED');
    return true;
  }
}
```
Pitfalls:
- `getAllAndOverride` handler-over-class means class-level `@RequirePermissions` is **replaced** (not merged) by a handler-level one; fine for KISS, document it.
- `@Public()` routes (flashcard `study/:id`, `study/:id/access` today use `OptionalAuthGuard`) still get `req.user` when token valid -> replaces `OptionalAuthGuard` (DRY).
- `getType()` branch: for gRPC controllers (`context.getType()==='rpc'`) read `authorization` from metadata; HTTP uses request. Also WS (study-room socket.io handshake) needs same verify in gateway/`handleConnection`; guards for gateway `http-proxy` upgrade are hand-written (`main.ts:139-211`) — reuse `verifyAccessToken`.
- CI test: walk routes via `DiscoveryService`, fail on any handler with no `@Public/@Authenticated/@RequirePermissions` (208 handlers migrating).

### Ownership / resource checks: CASL vs plain

| Option | Fit | Cost |
|---|---|---|
| **Plain Prisma `where` / service predicates (rec.)** | 3-4 predicates only: owner; whitelist/invite/public access; exam-session allowed; room host | ~0 deps, testable |
| CASL (`@casl/ability` 7.0.2, active) | Wins at many resources + attribute rules + FE sharing + DB-level filtering (`@casl/prisma`) | new DSL, per-request ability build, learning curve — YAGNI here |
| `@nestjs/authorization` 0.1.0 (docs now show `@Can(Policy)`) | Interesting global deny-by-default | **peerDeps `@nestjs/core ^12`**, pre-1.0, created 2026-09-29 -> not usable on Nest 11. Reject. |

OWASP prefers ABAC/ReBAC over pure RBAC for object-level, but our object rules are few. Adopt CASL only if resource types x rules grow past ~5-6.
```ts
// repository helper: ownership folded into the query; miss => 404 (no existence leak, no TOCTOU)
async findOwnedQuizSet(id: string, ownerId: string) {
  const row = await this.prisma.quizSet.findFirst({ where: { id, ownerId } });
  if (!row) throw new NotFoundException();
  return row;
}
// lists: where: { ownerId: user.id }   // teacher "sees content they created"
```

## 3. Gateway coarse vs service fine
| Layer | Does | Does NOT |
|---|---|---|
| Gateway | JWKS verify, `sid` revoked, `invalid_before` -> 401 TOKEN_STALE, **prefix-level** `permissions:` (e.g. `/admin/*: [user:read]`, `/ai/*`, `/wallet/*`, uploads) | per-route perms, ownership, DB |
| Service | `@RequirePermissions` per handler (authoritative), ownership/whitelist/invite/room checks, business rules | session checks |

YAML sketch (extends ARCHITECTURE §4 `routes:`):
```yaml
- { path: /api/v1/ai/**,      auth: required, permissions: [ai:generate] }   # reject STUDENT before multer buffers upload
- { path: /api/v1/admin/**,   auth: required, permissions: [user:read] }
- { path: /api/v1/wallet/**,  auth: required, permissions: [wallet:use] }
```
Why not full per-route YAML: duplicates decorators (DRY), drifts, and services must enforce anyway (internal gRPC + direct-to-service path). Why keep coarse: cheap early 403 (gateway buffers uploads/SSE today — scout) and defense in depth. Gateway imports the same `hasPermission` -> one map. 
Redis outage policy (not in ARCHITECTURE): stale/revocation check **fail-open** for ordinary routes (availability; max exposure 15m) + alert; **fail-closed** for `/admin/*` and `role:assign`.

## 4. Prisma modelling

| | Enum + boolean (A, rec.) | `UserRole` table (B) |
|---|---|---|
| Exactly-one base role | Enforced by schema | Needs partial unique index + app logic |
| Combinable admin flag | Boolean | Row |
| Fixed roles in code | Fits | Over-general; seed/sync table with code enum = DRY violation |
| Future dynamic roles | Migration | Native |

**Call: A.** Switch to B only on dynamic roles/multi-org (YAGNI).
```prisma
enum Role { STUDENT TEACHER }
model User {
  role          Role    @default(STUDENT)
  isSystemAdmin Boolean @default(false) @map("isAdmin")   // MUST @map: see warning
}
model RoleChangeLog {   // actor/target FKs onDelete: SetNull + email snapshots survive user deletion
  id String @id @default(cuid())
  targetUserId String?  actorUserId String?  targetEmail String  actorEmail String
  fromRole Role  toRole Role  fromAdmin Boolean  toAdmin Boolean
  source String  // 'admin-ui' | 'cli'
  createdAt DateTime @default(now())
  @@index([targetUserId, createdAt])
}
```
Warnings:
- Deploy uses `prisma db push` (scout) — renaming a field without `@map` = drop+add column = **data loss of admin flags**. Use `@map("isAdmin")` or a hand-written `ALTER TABLE RENAME COLUMN`.
- Backfill: existing users who own quizsets/flashcards/exam rooms/study rooms must become TEACHER, else they lose access to their own content. Rule needs product confirmation (see open questions).
- Existing legacy `/admin/audit` exists in FE: reuse if it already has a general audit table; otherwise `RoleChangeLog` above (KISS, typed columns). Not verified.
- Owner of writes: only auth-service writes `role`/`isSystemAdmin` (admin-service currently writes User at `admin-users.service.ts:218-407` — remove during split). `ADMIN_EMAILS` CLI must also write an audit row + call `InvalidateUser`.

Last-admin / self-demotion (single transaction, row-lock serialises concurrent demotions):
```ts
await this.prisma.$transaction(async (tx) => {
  if (actorId === targetId) throw new ForbiddenException('CANNOT_CHANGE_OWN_ROLE');   // KISS: block all self-change
  const target = await tx.user.findUniqueOrThrow({ where: { id: targetId } });
  if (target.isSystemAdmin && dto.isSystemAdmin === false) {
    const admins = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE "isAdmin" = true FOR UPDATE`;
    if (admins.length <= 1) throw new ConflictException('LAST_SYSTEM_ADMIN');
  }
  await tx.user.update({ where: { id: targetId }, data: { role: dto.role, isSystemAdmin: dto.isSystemAdmin } });
  await tx.roleChangeLog.create({ data: { /* from/to, actor, snapshots */ } });
});
await this.gateway.invalidateUser(targetId);   // AFTER commit; NOT RevokeUserSessions
```
Also: re-check actor `isSystemAdmin` against DB on this endpoint (rare route; "direct lookup for permission changes" per sources) — covers the up-to-15m stale-admin window if Redis is down. Emit `auth.user.updated` for study-room socket kick (if TEACHER->STUDENT, host powers must drop).

Staleness race: compare `iat < invalid_before` (both seconds). Token minted in the same second as invalidation passes; accepted (<=15m, narrow). Client refresh-on-TOKEN_STALE must retry **once** (avoid loop if clock edge yields second STALE).

## 5. FE patterns (React 19, Zustand, axios, react-router)

Facts: JWT is HttpOnly cookie (§5.2) -> FE **cannot decode** roles -> need server-supplied data anyway. Mobile (Kotlin) also benefits: no catalog copy needed.

Ranked:
1. **Server returns `{ roles, permissions }` in login/refresh/`GET /auth/me`; FE stores; `useCan` reads store. Codegen only `Permission` union** (emit ~20-line `permissions.generated.ts` from `libs/auth-jwt/src/permissions.ts`; CI `git diff --exit-code`). Typos in `useCan('quizset:crate')` become compile errors. Admin matrix screen: `GET /admin/roles` returns `ROLE_PERMISSIONS` (read-only, always truthful, no FE copy).
2. Same but `Permission = string` (zero tooling; typo risk).
3. Hand-duplicated catalog in FE (reject: DRY, drift).
```tsx
// stores/useAuthStore.ts: add roles, permissions: Set<Permission>, applySession(user)
export const useCan = (p: Permission) => useAuthStore((s) => s.permissions.has(p));
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const ok = useCan(permission); const ready = useAuthStore((s) => s.hydrated);
  if (!ready) return <PageSkeleton />;
  return ok ? children : <Navigate to="/403" replace />;
}
// routes/index.tsx
{ path: 'teacher/quiz-sets/new', element: <RequirePermission permission={PERMISSIONS.QUIZSET_CREATE}><QuizSetEditor/></RequirePermission> }
// sidebar: config-driven, no scattered ifs
const NAV = [{ to:'/k/quiz-sets', label:'Quiz', permission: P.QUIZSET_CREATE }, { to:'/k/study', label:'Học', permission: P.FLASHCARD_STUDY }, ...];
const items = NAV.filter((i) => can(i.permission));
```
- **Role-based sidebar = permission-based sidebar.** Filter by permission, not `role === 'TEACHER'` (one rule, matches BE). Landing redirect: STUDENT -> study home, TEACHER -> dashboard.
- **403 page** (`/403`) for route guard; API 403 `PERMISSION_DENIED` -> toast; optionally refetch `/me` once (perm may have changed) then retry decision. Hiding UI is UX only (OWASP: server enforces).
- **TOKEN_STALE:** existing axios 401 -> `/auth/refresh` -> retry already covers it (ARCHITECTURE §9). Add: after refresh success call `applySession(res.user)`, and reset feature stores/caches whose visibility depends on role (CLAUDE.md caches store data across navigation -> stale teacher-only data would linger after demotion). Single in-flight refresh promise (mutex) to avoid refresh stampede; retry-once cap.

## 6. Security pitfalls

| Pitfall | Status / mitigation |
|---|---|
| **Privilege escalation via register DTO** | `RegisterSchema` (zod object, strips unknown keys) has no role field — OK today; keep it. Never `data: {...dto}` into `prisma.user.create/update` (grep found none in auth/admin now). OAuth signup path sets `STUDENT` implicitly via DB default. Make auth DTOs `.strict()` to 400 on injected `role`/`isSystemAdmin` (cheap signal). Profile-update DTO must whitelist fields. `role:assign` endpoint lives in auth-service only. |
| **IDOR on whitelist/invite endpoints** | `flashcardset.controller.ts`: `GET :id/sharing`, `POST :id/generate-code`, sharing PUT are `AuthGuard` only — owner check must be in service (`findFirst({id, ownerId})` -> 404). STUDENT must NOT reach `:id/sharing` (leaks whitelist emails + invite code) -> `@RequirePermissions([FLASHCARD_SET_MANAGE])` + owner. Same for examsession sharing. `GET users/search` (whitelist autocomplete) -> TEACHER-only, min length, rate-limit, return `{id, username}` not email (user enumeration). `verify-code` / `with-code`: throttle per IP+setId, high-entropy codes, constant-time compare. Access check for study/exam by non-owner: single `canAccess(userId, setId)` predicate (owner | whitelist | invite-unlocked | public) reused by `access`, `study`, `with-code` (DRY). |
| **Stale tokens** | `InvalidateUser` after commit; refresh MUST reload role from DB (never copy old claims — else demoted user keeps role forever). Access TTL 15m max exposure. High-risk routes (`role:assign`, admin finance) do a fresh DB check. Redis fail policy as §3. |
| **gRPC metadata spoofing** | ARCHITECTURE §5.3 trusts `x-user-id`/`x-user-roles` because port is internal. One SSRF/compromised container (or published port, e.g. Postgres is already published on 5411) = impersonate admin. **Rec:** forward original JWT in `authorization` metadata, verify with same lib (RS256 verify cost is microseconds-scale; measure) — identical code path as HTTP. System-initiated calls (cron/events): separate service identity (existing `x-internal-service-token` pattern, distinct secret per caller, never reuse user-token keys). mTLS when on K8s remains additive. |
| Direct service reach | Services verify `iss/aud/typ/alg` themselves; internal network only; never publish service ports. |
| Algorithm confusion / `none` | Pin `algorithms:['RS256']` (RFC 8725 3.1); JWKS must contain only signing keys with `use:sig`. |
| TEACHER taking others' exams | Needs `exam_session:take` STUDENT-only + attempt service check; teacher preview own = owner check. Without it, a TEACHER+STUDENT-like workaround appears. |
| Info leak on denial | 404 for non-owned resources; 403 only for permission denial. Log all 403/401 TOKEN_STALE with `userId, route, perm` (OWASP logging). |

## Limits / not covered
- jose behaviour with stale JWKS cache + auth-service outage unverified (docs gave defaults only) -> integration test.
- Exam/examsession service bodies not read: IDOR notes come from controller decorators; service ownership logic needs audit. `/admin/audit` schema not inspected.
- Mobile app absent from checkout; RS256 verify cost not benchmarked; study-room socket auth only per ARCHITECTURE text.

## Unresolved questions
1. Backfill rule for existing users (who becomes TEACHER)? Anyone owning content? Anyone with wallet/subscription?
2. TEACHER -> STUDENT demotion: what happens to their quiz sets / exam rooms / hosted study rooms / wallet balance (hide, orphan, block demotion)?
3. Confirm `SYSTEM_ADMIN` = admin-only perms (no wildcard); admin who wants to teach must also be TEACHER.
4. Redis down: fail-open for normal routes acceptable?
5. Teacher owner-preview of own exams ok? TEACHER studying another teacher's granted set assumed yes.
