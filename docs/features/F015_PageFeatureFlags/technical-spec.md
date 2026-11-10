# F015_PageFeatureFlags

**Priority**: P1
**Type**: ui
**Generated**: 2026-07-03

## Overview

Dynamic page enable/disable system that lets admins hide incomplete or problematic pages from all users without a redeploy. A single `PageFeatureFlag` table (keyed by page slug) is the source of truth. Admin writes go through a strict order — DB update → audit log → push of the full flag map to the gateway over gRPC `GatewayControl.SetPageFlags` (the gateway writes Redis and publishes to SSE clients; admin-service no longer touches Redis). An audit failure is logged and does not block the toggle; a failed push is rethrown so the admin retries (set-style, safe). When Redis has no flags the gateway pulls them at boot from admin's `AdminService.GetPageFlags` (retry plus a 60 s watcher). Enforcement happens at two independent layers: the gateway (`PageEnabledGuard`, 404 on explicit disable, fail-open on any infra error) and the frontend (`FeatureRoute` + sidebar filter, reactive to a Zustand store kept live via SSE).

## Polymorphic Behavior

N/A — no discriminator fields in Key Entities.

## Cross-Cutting Logic

### Requirements

| Code | Description | Endpoint/Handler | Verifiable |
|------|-------------|-----------------|------------|
| FR-001 | Admin can list all page flags with current state | `AdminPageConfigController.list` | yes |
| FR-002 | Admin can toggle a page's enabled state | `AdminPageConfigController.toggle` | yes |
| FR-003 | Public/guest clients can fetch the current flag map on bootstrap | `ConfigController` (gateway) `GET /config/pages` | yes |
| FR-004 | Authenticated clients receive realtime flag updates via SSE | `ConfigController` `GET /config/stream` | yes |
| FR-005 | Gateway blocks proxy routes whose page flag is explicitly disabled | `PageEnabledGuard.canActivate` | yes |
| FR-006 | Frontend hides routes/sidebar items whose page flag is disabled | `FeatureRoute`, `SideBar.tsx` filter | yes |

**Source:** `kmaedu-be/apps/admin-service/src/modules/admin-page-config/admin-page-config.controller.ts:34-49`, `kmaedu-be/apps/gateway-service/src/controllers/config.controller.ts:26-54`, `kmaedu-be/apps/gateway-service/src/guards/page-enabled.guard.ts:31-52`

### Business Rules

- **BR-001**: A page is enabled unless its flag is explicitly `false` — absence of a key in the map means enabled (default-on semantics), consistently applied across the gateway guard (`=== false`), FE store (`!== false`), `FeatureRoute` (`!== false`), and sidebar filter. Source: `page-enabled.guard.ts:31-52`, `usePageConfigStore.ts:22`.
- **BR-002**: Any infrastructure error (Redis/DB failure) during flag lookup fails OPEN — the request/page is allowed rather than blocked. Source: `page-enabled.guard.ts:45-51`, `usePageConfigStore.ts:28-31`.
- **BR-003**: A blocked route returns `404 Not Found`, not `403 Forbidden`, specifically to avoid revealing the page's existence to a caller who shouldn't see it. Source: `page-enabled.guard.ts:12-14`.
- **BR-004**: `toggle()` validates the key against `TOGGLEABLE_PAGE_KEYS` before writing; an invalid key raises `BadRequestException`, and a key with no matching DB row raises `NotFoundException`. Source: `admin-page-config.service.ts:66-79`.
- **BR-005**: Toggle write order is fixed: (1) DB update as source of truth, (2) `AdminAudit` row (try/catch; failure only logs), (3) push the full map from DB to the gateway via `SetPageFlags` (serialized; each push re-reads the map; failure is rethrown). The gateway owns `config:pages:flags` and the `config:pages` publish. Source: `kmaedu-be/apps/admin-service/src/modules/admin-page-config/admin-page-config.service.ts`.
- **BR-006**: Some page keys (`my-materials`, `my-exams`, `history`) have an empty `PAGE_ROUTE_MAP` entry — they are FE-only toggles, deliberately not enforced at the gateway because they share core routes with other still-enabled features. Source: `page-keys.ts:31-34`.
- **BR-007**: Route-prefix matching in `pathname-to-page-key.ts` is order-sensitive — longer/more specific prefixes (e.g. `manage-exam-room`) must be checked before shorter ones (e.g. `manage-exam`) to avoid mis-mapping. Source: `pathname-to-page-key.ts:8-9,11-23`.

### Decision Logic

- **DEC-001** (render): Whether a routed page renders its content or `<NotFound/>` — decided by `FeatureRoute` reactively reading `pages[pageKey] !== false` from the store. `user_visible_outcome`: user sees the page, or a client-side 404 with no API round-trip. Source: `FeatureRoute.tsx:17-23`.
- **DEC-002** (interaction): Whether a sidebar nav item is shown — admin-only items always show regardless of flag state; non-admin items are filtered by `pages[pageKey] !== false`. `user_visible_outcome`: nav item present or absent. Source: `SideBar.tsx:61,175-186`.

### State Machines

None.

### Algorithms

- **Cache-first read-through** (`ConfigService.getPages`): Redis `config:pages:flags` read first (O(1)); on cache miss, falls back to a full DB scan and repopulates Redis. Source: `config.service.ts:63-77`.
- **Single shared pub/sub subscription fan-out**: the gateway subscribes to `config:pages` exactly once in `onModuleInit` and fans updates out to all connected SSE clients via one shared RxJS `Subject`, avoiding a per-connection subscribe/unsubscribe. Source: `config.service.ts:40-51`.

### External Integrations

- **Redis pub/sub** — `CONFIG_PAGES_CHANNEL = 'config:pages'` for cross-instance realtime propagation; `CONFIG_PAGES_KEY = 'config:pages:flags'` for the cached flag map. Source: `cache-keys.ts:157,163`.

### Verification

- **SC-001** — Toggling a flag off in the admin screen causes the corresponding route/page to 404 for other users within one SSE push cycle.
- **SC-002** — A Redis outage during a page-load does not block access to any page (fail-open).
- **SC-003** — An admin audit row is written for every successful toggle, with before/after state.

---

**Client behavior:** see
[`behavior-logic.md`](../../docs/system/behavior-logic.md) (client-side patterns — debounce, optimistic UI, polling, upload, realtime),
[`permissions.md`](../../docs/system/permissions.md) (feature flags / experiments / env / locale gates),
[`architecture.md`](../../docs/system/architecture.md) (guards / deep-link state restoration / unsaved-changes protection).

## User Stories

_See `business-context.md` for plain-language user story narrative._

### Edge Cases

See `edge-cases.md` for the full table of scenarios, expected behavior, and user-facing messages.

## Key Entities

| Entity | Table | Key Columns | Purpose |
|--------|-------|-------------|---------|
| PageFeatureFlag | `PageFeatureFlag` | key (PK), label, enabled, updatedAt | One row per togglable page; `key` must be one of `TOGGLEABLE_PAGE_KEYS` |

## Artifact References

| Artifact | File | Codes Used | Reviewed |
|---------|------|------------|----------|
| System Overview | [system-overview.md](../../docs/system/system-overview.md) | — | [x] |
| Architecture | [architecture.md](../../docs/system/architecture.md) | — | [x] |
| Feature List | [feature-list.md](../../docs/generated/feature-list.md) | F015 | [x] |
| Screen List | [screen-list.md](../../docs/generated/screen-list.md) | SCR039 | [x] |
| Permissions | [permissions.md](../../docs/system/permissions.md) | PERM054, PERM055 | [x] |

## Assumptions

- Page-key constants exist in two copies with no shared import — backend (`kmaedu-be/libs/common/src/constants/page-keys.ts:10-19`) and frontend (`kmaedu-fe/src/lib/page-keys.ts:6-15`) — the FE copy's own comment notes it "must be kept in sync manually."
- No dedicated Prisma migration file was found for `PageFeatureFlag`; schema is assumed applied via `prisma db push` rather than a tracked migration.

## Source Code References

| Symbol | Path | Purpose |
|--------|------|---------|
| PageFeatureFlag (model) | `kmaedu-be/apps/admin-service/prisma/schema.prisma` | Data model |
| AdminPageConfigController | `kmaedu-be/apps/admin-service/src/modules/admin-page-config/admin-page-config.controller.ts:27-49` | Admin list + toggle endpoints |
| AdminPageConfigService | `kmaedu-be/apps/admin-service/src/modules/admin-page-config/admin-page-config.service.ts:46-124` | Toggle write-order logic, cache rebuild |
| ConfigController (gateway) | `kmaedu-be/apps/gateway-service/src/controllers/config.controller.ts:16-54` | Public flag fetch + SSE stream |
| ConfigService (gateway) | `kmaedu-be/apps/gateway-service/src/controllers/config.service.ts:40-89` | Read-through cache, pub/sub fan-out |
| PageEnabledGuard | `kmaedu-be/apps/gateway-service/src/guards/page-enabled.guard.ts:31-52` | Route-level enforcement, fail-open |
| page-keys constants | `kmaedu-be/libs/common/src/constants/page-keys.ts:10-45` | `TOGGLEABLE_PAGE_KEYS`, `PAGE_ROUTE_MAP` |
| usePageConfigStore | `kmaedu-fe/src/stores/usePageConfigStore.ts:20-32` | FE state, fail-open `loadPages` |
| configApi | `kmaedu-fe/src/apis/configApi.ts:17-151` | `fetchPages`, `openConfigStream` (SSE + backoff) |
| adminPageConfigApi | `kmaedu-fe/src/apis/adminPageConfigApi.ts:11-25` | Admin list/toggle API client |
| AdminPageConfigPage | `kmaedu-fe/src/pages/admin/AdminPageConfigPage.tsx:35-51` | Admin UI, optimistic update + rollback |
| FeatureRoute | `kmaedu-fe/src/routes/guards/FeatureRoute.tsx:17-23` | Client-side route gate |
| pathname-to-page-key | `kmaedu-fe/src/lib/pathname-to-page-key.ts:8-23` | Pathname → PageKey mapping (order-sensitive) |
| usePageConfigSse | `kmaedu-fe/src/hooks/usePageConfigSse.ts:16-33` | SSE subscription + self-eviction toast |
| SideBar (filter) | `kmaedu-fe/src/components/organisms/k/SideBar.tsx:61,175-186` | Nav item filtering |

## Unresolved Questions

1. **Dual constant source**: Should `page-keys.ts` be moved into a shared package to eliminate the manual-sync risk between backend and frontend copies?
2. **Migration tracking**: Is `PageFeatureFlag` schema change tracked by a Prisma migration file, or applied ad hoc via `db push` in all environments including production?
3. **FE-only toggle scope**: Should `my-materials`, `my-exams`, `history` eventually get gateway-level enforcement, or is FE-only intentional long-term?
