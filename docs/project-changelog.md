---
title: Examio Project Changelog
last_updated: 2026-07-24
---

# Examio Project Changelog

## [Unreleased] — 2026-07-24

### Added

#### UTM Signup Attribution (Admin Dashboard + Auth)

Tracks first-touch `utm_source` for new signups and surfaces a breakdown on the admin stats dashboard.

- **Database**: `User.utmSource String? @db.VarChar(64)` (indexed) — `libs/database/src/models/user.prisma`.
- **Auth capture**: `RegisterDto.utmSource` (email signup); Google OAuth carries it through the `state` param; Google One Tap accepts it in the request body. Sanitized server-side (`sanitizeUtmSource` — whitelist charset, 64-char cap, rejects a spoofed literal `"direct"`) before being stamped on `User` at signup.
- **FE capture**: `src/lib/utmSource.ts` grabs `?utm_source` on first page load and persists it client-side (first-touch only) until signup; encoded into the OAuth `state` for Google flows.
- **Admin API**: `GET /admin/stats/sources` (canonical, `AdminStatsController`) + `GET /admin/sources` (FE-facing alias, `AdminStatsFeRoutesController`) — signup counts grouped by `utm_source` (null → `"direct"`), top 20 desc, optional date range.
- **Admin UI**: new "Top nguồn" (`SourceBreakdownChart`) card on `AdminStatsPage` (SCR034).

## [Unreleased] — 2026-07-21

### Added

#### Study Room — Playlist, Access & Moderation (web only)

Extends the Study-Together Room feature (2026-07-19 entry below) with an ordered YouTube playlist, room access control, and host/cohost moderation. **Web only** — no `examio-app` counterpart.

**Backend — `exam-service`**

- **Playlist**: `StudyRoomPlaylistItem` (Prisma, `libs/database/src/models/study-room.prisma`) — ordered list of videos or YouTube playlists (`kind` 0 VIDEO / 1 PLAYLIST) per room, persisted (unlike timer/media/chat, which stay Redis-only). Auto-advance is **server-authoritative but keyless** — no YouTube Data API call; instead a designated "leader client" (one member, tracked in Redis `PlaylistState.leaderUserId`) reports `media:ended` and the server advances `currentIndex` and broadcasts the new item to everyone else
  - Host/cohost can skip via `playlist:next`/`playlist:prev`/`playlist:jump`; add/remove/reorder gated by `StudyRoom.playlistAddPermission` (0 EVERYONE / 1 COHOST+ / 2 HOST)
- **Access control**: `StudyRoom.accessType` (0 PUBLIC — any authenticated user / 1 CODE — 6-digit invite / 2 WHITELIST — explicit `userId[]` in `StudyRoom.whitelist`), mirroring the existing `ExamSession` access model. New `POST /api/v1/studyrooms/:id/join` (`StudyRoomController.joinById`) alongside the existing code-based `POST /studyrooms/join`
- **Moderation**: `StudyRoomMember.isBanned` (kick + block rejoin) and `.isMuted` (room-wide chat block), settable only by host/cohost, enforced server-side on every mutating socket event. Ban propagates cross-instance via the existing `@socket.io/redis-adapter` (`RedisIoAdapter`) so a banned member is kicked from whichever `exam-service` instance holds their socket
- **Personal chat block**: `StudyRoomChatBlock` (Prisma) — per-user, room-scoped block list; server persists the block and also tells the blocking client's UI to filter (`blocks:updated` sends `{blockedUserIds}` to the blocker only — not broadcast room-wide)
- WS event contract (`study-room.events.ts`, still the source of truth) gains:
  - client → server: `playlist:add`, `playlist:remove`, `playlist:reorder`, `playlist:next`, `playlist:prev`, `playlist:jump`, `media:ended` (leader-only), `chat:block`, `chat:unblock`, `member:ban`, `member:unban`, `member:mute`, `member:unmute`
  - server → client: `playlist:updated` (`{items, currentIndex, leaderUserId}`), `blocks:updated` (`{blockedUserIds}`, blocker-only), `member:moderated` (`{userId, isBanned?, isMuted?}`), `room:kicked` (sent to the banned member just before forced disconnect)

**Database — Prisma schema additions** (`libs/database/src/models/study-room.prisma`)

```prisma
model StudyRoom {
  // ...existing fields...
  accessType            Int      @default(0) // 0 PUBLIC | 1 CODE | 2 WHITELIST
  whitelist             String[] @default([])
  playlistAddPermission Int      @default(1) // 0 EVERYONE | 1 COHOST+ | 2 HOST
  playlist StudyRoomPlaylistItem[]
}

model StudyRoomMember {
  // ...existing fields...
  isBanned Boolean @default(false)
  isMuted  Boolean @default(false)
}

model StudyRoomPlaylistItem {
  id, studyRoomId, url, kind (0 VIDEO/1 PLAYLIST), title, addedByUserId, order, createdAt
}

model StudyRoomChatBlock {
  id, studyRoomId, blockerId, blockedId, createdAt
  @@unique([studyRoomId, blockerId, blockedId])
}
```

- **Migration status**: applied directly to the dev database via `psql` for local verification; **no migration file has been generated/committed yet** (same gap flagged for the base Study-Together Room models on 2026-07-19 — `StudyRoom`/`StudyRoomMember` still have no migration either). Block before any environment that runs `prisma:deploy` gating.

**Frontend (`examio-fe`)**

- Playlist UI, access-mode room settings, and moderation controls (ban/mute, personal chat block) wired into the existing `/k/study-room` / `/k/study-room/:id` pages, `useStudyRoomSocket.ts`, `useStudyRoomStore.ts`, and `src/types/studyRoom.ts` (mirrors the event contract above)

**Key Design Decisions**

- No YouTube Data API dependency for auto-advance — a single "leader" client (not the server) detects end-of-media via the YouTube IFrame API and reports it; the server treats that report as authoritative and fans the advance out to the room. Keeps the feature within the existing Redis-authoritative live-state model instead of adding a new external API integration
- Access modes reuse the `ExamSession` PUBLIC/CODE/WHITELIST shape rather than inventing a new access model
- Moderation state (`isBanned`/`isMuted`) lives on `StudyRoomMember`, not Redis, so bans/mutes survive reconnects and Redis flushes; propagation to other room instances rides the same `@socket.io/redis-adapter` already in place for broadcasts

---

## [Unreleased] — 2026-07-19

### Added

#### Study-Together Room (web only)

Dedicated page where multiple users study together in a private room: synchronized Pomodoro timer (work/break/long-break), shared YouTube media (play/pause/seek sync), live roster (studying/on-break), ephemeral chat, and a focus-time leaderboard. Host + co-hosts control the room via a 6-digit invite code. **Web only** (`examio-fe`) — no `examio-app` (mobile) counterpart yet.

**Architecturally new — first WebSocket/Socket.io usage in the backend.** Previously the backend only had SSE + Redis pub/sub + RabbitMQ + gRPC for realtime/async communication (see `docs/system/architecture.md` § Cross-Service Communication).

**Backend — `exam-service`**

- New `StudyRoomModule` (`apps/exam-service/src/modules/study-room/`): `StudyRoomGateway` (Socket.io `@WebSocketGateway`, path `/ws/study`, websocket-only transport — long-polling intentionally dropped to avoid sticky sessions across gateway instances), `StudyRoomService`, `StudyRoomRepository`, `StudyRoomStateService` (Redis-backed live state), `StudyRoomBroadcaster`, `StudyRoomSocketAuth`, `StudyRoomPomodoro` (deterministic timer: server stores `{phase, cycle, phaseStartedAt, running}`, clients compute countdown locally)
- `RedisIoAdapter` (`redis-io.adapter.ts`) wires `@socket.io/redis-adapter` so socket broadcasts fan out correctly across multiple `exam-service` instances
- Socket handshake auth: JWT from `handshake.auth.token` (or `token` cookie fallback), same verify + active-session check as `AuthGuard`, in `StudyRoomSocketAuth`
- REST surface under `/api/v1/studyrooms` (`StudyRoomController`): `POST /` create, `GET /mine`, `POST /join`, `GET /:id`, `PUT /:id`, `DELETE /:id`, `POST /:id/leave`, `POST /:id/regenerate-code`, `GET /:id/leaderboard`
- Live state (timer phase/cycle, media play position, chat, presence) lives in Redis only; Prisma holds room config + membership. Chat is an ephemeral Redis LIST capped at 200 messages — **no** `StudyRoomMessage` Prisma model
- Focus-time credit: 30s heartbeat increments a Redis counter per member, flushed to `StudyRoomMember.totalFocusSeconds` on room close and periodically via a 5-min sweep (`StudyRoomGateway.afterInit`)
- WS event contract (`study-room.events.ts`, source of truth — FE mirrors it): client → server `room:join/leave`, `presence:heartbeat`, `timer:start/pause/reset/config`, `media:set/play/pause/seek`, `chat:send`, `role:grant/revoke`; server → client `room:snapshot`, `presence:updated`, `timer:updated`, `media:updated`, `chat:message`, `role:updated`, `room:closed`, `error`

**Backend — `gateway-service`**

- WebSocket upgrade proxy: `http-proxy` (`ws: true`) forwards `upgrade` requests whose URL starts with `WS_STUDY_PATH` (`/ws/study`) to `exam-service`; other upgrade requests are closed. This is a **net-new capability** — the gateway previously only did buffered HTTP/Axios proxying plus one SSE passthrough
- `StudyRoomProxyController` (`/api/v1/studyrooms/*`, gated by `PageEnabledGuard` + `TogglePage('study-room')`) proxies the REST surface to `exam-service` via `ProxyService.forwardWithAuth`

**Database — Prisma schema additions** (`libs/database/src/models/study-room.prisma`)

```prisma
model StudyRoom {
  id, name, description, hostId, inviteCode (unique, 6-digit)
  workMinutes, breakMinutes, longBreakMinutes, cyclesBeforeLongBreak
  currentMediaUrl, isActive, maxParticipants
}

model StudyRoomMember {
  studyRoomId, userId, role (0 MEMBER/1 COHOST/2 HOST)
  totalFocusSeconds, joinedAt, lastSeenAt
  @@unique([studyRoomId, userId])
}
```

- **No migration has landed yet for these models** — schema change is present but not applied via `prisma:migrate`/`prisma:deploy`; treat as pending on the shared DB until a migration ships.

**Frontend (`examio-fe`)**

- New routes `/k/study-room` (`StudyRoomListPage`, gated by `FeatureRoute pageKey="study-room"`) and `/k/study-room/:id` (`StudyRoomPage`)
- `src/apis/studyRoomApi.ts` — REST client for the `/studyrooms` surface
- `src/hooks/useStudyRoomSocket.ts` + `src/stores/useStudyRoomStore.ts` — Socket.io client connection, event handling, and room state store
- `src/types/studyRoom.ts` — mirrors the backend WS event contract

**Key Design Decisions**

- Socket.io/WebSocket chosen over SSE for this feature specifically because it needs bidirectional low-latency sync (timer control, media seek, chat) — unlike the existing SSE use cases (AI chat streaming, admin log tail, page-config push), which are all server-to-client only
- Gateway remains the single public entry point — WS traffic is proxied through it rather than exposing `exam-service` directly
- Scope: web only, private rooms, ~10–20 capacity; WebRTC excluded

**Implementation plan**: `plans/260719-1844-study-together-room/`

---

## [Unreleased] — 2026-07-17

### Added

#### Word Family — Single Root-Word Regeneration (F016)

(Re-)generate the child words for one specific root word on the detail page, overwriting the existing record.

**Backend — `exam-service` + `gateway-service` + `ai-service`**

- Route `POST /api/v1/word-family/generate-root` — `WordFamilyController.generateWordFamilyForRoot` → `WordFamilyService.generateWordFamilyForRoot`
- Gateway proxy route added in `WordFamilyProxyController`
- Python AI service `generate/word-family` request gained an optional `rootWord` field; when present, the prompt targets that exact root instead of proposing new ones
- Always overwrites via the existing `[rootWord, categorySlug]` upsert; concurrency lock is scoped per `userId:categorySlug:rootWord`, so it doesn't contend with the category-wide `generate` lock

**Frontend (`examio-fe`)**

- `generateWordFamilyForRootApi` added to `src/apis/wordFamilyApi.ts`; wired to a `useWordFamilyStore` action and a regenerate button on `WordFamilyDetailPage`

### Fixed

#### Word Family — background generate-root job + status endpoint (F016)

Follow-up fix in the same round: `generate-root` originally awaited the AI HTTP call before responding, so a slow model call could exceed the gateway proxy timeout.

**Backend — `exam-service` + `gateway-service`**

- `WordFamilyService.generateWordFamilyForRoot` now acquires the `userId:categorySlug:rootWord` lock, fires the AI call + upsert via an unawaited `runRootGeneration` background worker, and returns `{ generating, categorySlug, rootWord, startedAt }` immediately instead of waiting on the AI response
- New route `GET /api/v1/word-family/generation-status/:slug/:rootWord` — `WordFamilyService.getRootGenerationStatus`, proxied via `WordFamilyProxyController`; root-scoped status, independent of the existing category-level `generation-status/:slug`
- `GET /api/v1/word-family/category/:categorySlug/:rootWord` (`getWordFamily`) now returns a flattened `{ id, rootWord, categorySlug, words, createdAt, updatedAt }` instead of the raw record with the payload nested under `.data`, matching the FE `WordFamilyData` type

**Frontend (`examio-fe`)**

- `generateWordFamilyForRootApi` return type changed from the full record to the background-job ack shape; new `getRootWordFamilyGenerationStatusApi` added to `src/apis/wordFamilyApi.ts`
- `useWordFamilyStore`: renamed `regeneratingRoot` → `regeneratingKey` (`${categorySlug}:${rootWord}`); added `checkRootGenerationStatus` / `abandonRootGeneration`; `generateWordFamilyForRoot` now only fires the request — the poller triggers the refetch once the lock clears
- `WordFamilyDetailPage` polls `generation-status/:slug/:rootWord` every 5s (capped ~11min) on mount and after triggering a regenerate

## [Unreleased] — 2026-07-03

### Added

#### Page Feature Flags (F015 / Feature Toggling)

Full-stack feature toggle system enabling dynamic page enable/disable without redeployment.

**Backend — `admin-service` + `gateway-service`**

- New `PageFeatureFlag` Prisma model with fields: `key` (unique slug), `label`, `enabled`, `isSystemLevel`, `createdAt`, `updatedAt`
- `PageConfigModule` in admin-service: controller, service, repository
- `PageEnabledGuard` in `@examio/common` — validates request against enabled pages
- Gateway proxy: `PageConfigProxyController` routes `/api/v1/admin/page-config/*` to admin-service
- Shared page-key constants in `@examio/common/enums/page-keys.enum.ts` (DASHBOARD, AI_CHAT, EXAM_TAKING, etc.)
- SSE endpoint: `GET /api/v1/admin/page-config/stream` — real-time updates when flags change

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/page-config` | GET | Bearer | List all page flags |
| `/page-config/:id` | PATCH | Admin | Toggle page enabled state |
| `/page-config/stream` | GET | Bearer (SSE) | Real-time page flag updates |

- Seed script integration: `libs/database/src/seed/page-feature-flag.seed.ts` — default flags seeded in `seed:dev` + production (`seed:prod`)

**Frontend (`examio-fe`)**

- New `usePageConfigStore` Zustand store: manages page flag cache, SSE connection, realtime updates
- `PageConfigApiClient` in `src/apis/pageConfigApi.ts` — GET, PATCH, and SSE stream methods
- `PageConfigProvider` wrapper for root layout — initializes store + SSE listener on mount
- Sidebar filter: pages disabled via flag are hidden from `KLayout` navigation
- Route guards: `<ProtectedRoute>` checks `pageConfigStore.isPageEnabled(key)` before rendering protected pages
- i18n: Vietnamese + English translations in `public/locales/{vi,en}/page-config.json`

**Key Design Decisions**

- System-level flags (`isSystemLevel=true`) cannot be disabled; app-level flags can toggle
- SSE (no WebSocket) for real-time flag updates; graceful fallback to polling if connection fails
- Flags cached in Zustand; store syncs via SSE on change (300ms debounce)
- `PageEnabledGuard` runs AFTER `JwtAuthGuard` — ensures authenticated context
- Mobile (iosApp/androidApp) will require native flag sync (TODO: implement native feature flag bridge)

---

## [Unreleased] — 2026-06-14

### Added

#### Word Family Categories Seed (Phase 6)

- Seed file `libs/database/src/seed/word-family-category.seed.ts` — 10 categories inserted via `upsert`
- Seed wired into `libs/database/prisma/seed.ts` (imported and called from `main()`)
- No AI image generation endpoint; categories seeded with `imageUrl: null` (per design decision)
- Categories: shopping-restaurant, traffic-construction, workplace-leisure, position-title, location-place, meeting-work-office, travel-entertainment, banking-post-office, announcement-advertising, news-broadcasting-travel

#### Word Family Integration — NestJS Backend (Phase 3)

**Backend — `exam-service` + `gateway-service`**

- New `WordFamilyModule` in exam-service: controller, service, bridge service, repository, DTOs, interfaces
- `WordFamilyRepository` — Prisma CRUD for `WordFamilyCategory`, `WordFamily`, `UserSavedWordFamily` with Redis caching (TTL 30 min)
- `WordFamilyService` — business logic for categories, root words, detail, AI generation orchestration with dedup, user collections
- `WordFamilyBridgeService` — transactional conversion of word families to FlashCard decks (`FlashCardSet` + `FlashCard` + `DetailsFlashCard`)
- `WordFamilyProxyController` in gateway-service — 11 proxy routes under `/api/v1/word-family/*`
- Integration with Python AI service for word family generation (`POST /api/generate/word-family`)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/word-family/categories` | GET | Bearer | List active categories |
| `/word-family/categories` | POST | Admin | Create category |
| `/word-family/categories/:id` | PUT | Admin | Update category |
| `/word-family/categories/:id` | DELETE | Admin | Soft-delete category |
| `/word-family/categories/:slug/roots` | GET | Bearer | Get root words in category |
| `/word-family/category/:categorySlug/:rootWord` | GET | Bearer | Get word family detail |
| `/word-family/generate` | POST | Bearer | Generate via AI |
| `/word-family/save` | POST | Bearer | Save to collection |
| `/word-family/saved` | GET | Bearer | Get saved collections |
| `/word-family/saved/:id` | DELETE | Bearer | Remove from collection |
| `/word-family/:id/to-flashcard` | POST | Bearer | Convert to flashcard deck |

## [Unreleased] — 2026-06-07

### Added

#### Admin Dashboard (F014 / Phase 3)
Full-stack admin dashboard implementation, completing Phase 3 of the development roadmap.

**Backend — `admin-service` (NestJS, port 7006, gRPC 50056)**

| Module | Description |
|--------|-------------|
| `admin-bootstrap` | OnModuleInit reads `ADMIN_EMAILS` env, idempotent sync: skip existing, grant non-admin, create new |
| `admin-management` | CLI via `yarn bootstrap:admin`: `sync`, `list`, `grant <email>`, `revoke <email>` |
| `admin-users` | List (paginated, filter by search/admin/banned), detail, update, ban, unban, grant-admin, revoke-admin |
| `admin-audit` | Paginated audit log with admin include, optional filters |
| `admin-stats` | Overview (6 KPIs) + 3 series (signups/traffic/revenue), Redis 5-min cache, raw SQL `date_trunc` |
| `admin-finance` | Refund (status=4, reverse credits), credit (ADD/SUBTRACT), set-tier — all in `$transaction` Serializable |
| `admin-logs` | Log redactor (4 PII patterns), recent log tail, ticket exchange SSE stream |

- `AdminGuard` in `@examio/common` — standalone JWT verify + Prisma `isAdmin` lookup
- `AuditWriterService` — shared service writes one `AdminAudit` row per changed field
- User soft-delete: `isBanned = true` + `deletedAt = now()`
- Ticket exchange SSE: `POST /admin/logs/ticket` → Redis `sse:ticket:{uuid}` (300s, single-use) → `GET /admin/logs/stream?ticket=`
- Rate limiting: 30 req/min per admin (ThrottlerModule `name: 'admin'`)
- PII redaction: email, Bearer token, password JSON, JWT patterns
- Healthcheck: `GET /api/v1/health`
- gRPC: `ENABLE_ADMIN_GRPC=true` enables reflection on port 50056

**Frontend (`examio-fe`, route `/admin`)**

| Page | Components |
|------|-----------|
| Overview | `KpiCard`, `MiniChartCard`, `StatChart`, `RangeSelector`, Recharts Area/Line/Bar |
| Stats | 3 large charts with date range picker |
| Users | `UserTable` with `UserDetailDrawer`, ban/unban/grant/revoke actions |
| Finance | `PaymentTable` with `FinanceActionModal` (refund/credit/tier) |
| Logs | `LogViewer` with SSE reconnect backoff |
| Audit | `AuditTable` with expandable payload row |

- `AdminRoute` guard: redirect `/admin` → `/login` (unauthenticated) or `/k` (non-admin)
- `AdminLayout`: cream canvas `#faf9f5`, 6 nav items, admin name + Logout top bar
- Zustand `useAdminStore` with 5-min in-memory cache per endpoint
- antd Table with pagination + filters on all list pages
- Vietnamese + English i18n: `public/locales/{vi,en}/admin.json`
- KLayout sidebar: admin-only "Trang quản trị" nav link (visible when `user.isAdmin`)

#### Admin UI design-token realignment
All admin pages and components now strictly follow `DESIGN.md` tokens — no hardcoded hex, no antd `Tag` preset colors, no `shadow-inner`, no off-spec radii.

- New `BadgePill` component (3 brand variants: `positive`/`negative`/`neutral`) replaces every antd `<Tag color="geekblue|green|red|blue|volcano|purple|orange|cyan">` in admin (10 sites)
- `AdminLayout` body + sidebar + header + logout button: `bg-[#faf9f5]` → `bg-canvas` (token-driven, dark-mode safe)
- `LogViewer` terminal surface: `bg-[#181715] text-[#e6dfd8] shadow-inner` → `bg-surface-dark text-on-dark` (shadow dropped per DESIGN §Elevation)
- `MiniChartCard` + `StatChart`: raw hex consts `PRIMARY/GRID/AXIS_TEXT` → CSS-var reads; tooltip inline hex → `var(--canvas)` / `var(--hairline)`; `rounded-xl` → `rounded-lg` (12px content card)
- `KpiCard` `rounded-xl` → `rounded-lg`
- `RangeSelector` active tab: `text-white` → `text-on-primary`
- All admin page h1s: `text-2xl font-semibold` → `font-display text-3xl font-normal tracking-tight` (per DESIGN §Typography: display weight 400, negative tracking)
- `UserDetailDrawer` section h3s: drop `uppercase`, switch to display style
- `AuditTable` JSON pre block: `bg-[#faf9f5]` → `bg-canvas`

**Database — Prisma schema additions**

```prisma
// libs/database/src/models/user.prisma
isBanned   Boolean  @default(false)
deletedAt  DateTime?
adminAudits AdminAudit[]

// libs/database/src/models/admin-audit.prisma
model AdminAudit {
  id        String   @id @default(cuid())
  adminId   String
  action    String
  targetId  String?
  payload   Json?
  reason    String?
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  admin     User     @relation(fields: [adminId], references: [id], onDelete: Cascade)

  @@index([adminId, createdAt])
  @@index([action, createdAt])
}
```

**Gateway proxy**

- `apps/gateway-service/src/controllers/admin-proxy.controller.ts`: `@All('*')` catch-all forward `/api/v1/admin/*` to admin-service
- `apps/gateway-service/src/services/proxy.service.ts`: `admin: process.env.ADMIN_SERVICE_URL || 'http://localhost:7006'`

**Deployment**

- `deploy/docker-compose.yml`: admin-service + `examio_logs` volume
- `package.json`: `dev:admin`, `build:admin`, `start:admin`, `bootstrap:admin sync|list|grant|revoke`

**Permissions** (PERM046–PERM053)

| ID | Name | Description |
|----|------|-------------|
| PERM046 | `AdminRouteAccess` | Route guard via AdminGuard |
| PERM047 | `AdminUserManagement` | Ban/unban/soft-delete |
| PERM048 | `AdminGrantRevoke` | Grant/revoke admin |
| PERM049 | `AdminFinanceRefund` | Wallet refund |
| PERM050 | `AdminCreditAdjustment` | Manual credit adjustment |
| PERM051 | `AdminSubscriptionTierChange` | Subscription tier change |
| PERM052 | `AdminAuditLogView` | Audit log query |
| PERM053 | `AdminLogView` | Server log retrieval + SSE stream |

**Implementation plan**: `plans/260607-1538-admin-dashboard/`

---

*Older entries will be added as they are recorded.*