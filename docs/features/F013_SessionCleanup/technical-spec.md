# F013_SessionCleanup

**Priority**: P2
**Type**: background
**Generated**: 2026-06-05

## Overview

Daily cron job that scans all UserSession records and deactivates expired sessions. Runs at 03:00 AM server time via `node-cron`. In a single invocation it performs three operations: (1) deletes sessions with `expiresAt < now`, (2) deactivates sessions inactive for 30+ days, and (3) deletes sessions older than 90 days. All operations are delegated to the `UserSessionRepository`.

## Polymorphic Behavior

N/A — no discriminator fields in Key Entities.

## Cross-Cutting Logic

### Requirements

| Code | Description | Endpoint/Handler | Verifiable |
|------|-------------|-----------------|------------|
| FR-001 | Delete sessions past their expiry timestamp | UserSessionRepository.deleteExpiredSessions | yes |
| FR-002 | Deactivate sessions inactive for 30+ days | UserSessionRepository.deactivateInactiveSessions | yes |
| FR-003 | Delete sessions older than 90 days | UserSessionRepository.deleteOldSessions | yes |

**Source:** `kmaedu-be/apps/auth-service/src/devices/session-cleanup.cron.ts:1-52`

### Business Rules

- **BR-001**: Only sessions with `isActive === true` and `expiresAt < now` are deleted in the first pass.
- **BR-002**: Inactive deactivation targets sessions where `lastActivity < now - 30 days` and `isActive === true`.
- **BR-003**: Old session deletion targets sessions where `createdAt < now - 90 days`, regardless of `isActive`.
- **BR-004**: All three operations run sequentially in a single cron invocation; failures in one step do not stop the others.

### Decision Logic


None.
### State Machines


None.

### Algorithms

None.

### External Integrations

None.
### Verification

- **SC-001** — Sessions with `expiresAt` in the past are deleted on the next cron run
- **SC-002** — Sessions with `lastActivity` older than 30 days are set to `isActive = false`
- **SC-003** — Sessions with `createdAt` older than 90 days are hard-deleted

---

**Client behavior:** N/A — background-only feature; no frontend client.


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
| UserSession | `UserSession` | id, userId, sessionId, isActive, lastActivity, createdAt, expiresAt | Active login sessions subject to cleanup |

## Artifact References

| Artifact | File | Codes Used | Reviewed |
|---------|------|------------|----------|
| System Overview | [system-overview.md](../../docs/system/system-overview.md) | — | [x] |
| Architecture | [architecture.md](../../docs/system/architecture.md) | — | [x] |
| Feature List | [feature-list.md](../../docs/generated/feature-list.md) | F013 | [x] |
| Behavior Logic | [behavior-logic.md](../../docs/system/behavior-logic.md) | BL001 | [x] |
| Permissions | [permissions.md](../../docs/system/permissions.md) | PERM040 | [x] |

## Assumptions

- The cron schedule is hardcoded as `'0 3 * * *'` (03:00 AM daily); schedule configuration via environment variable or config file was not confirmed in source.
- `UserSessionRepository.deleteExpiredSessions`, `deactivateInactiveSessions`, and `deleteOldSessions` are assumed to use Prisma batch operations with transactions where appropriate.
- The cron runs on a single auth-service instance; in a multi-instance deployment, all instances schedule the job but only one should execute it (clustering or distributed lock not confirmed in source).

## Source Code References

| Symbol | Path | Purpose |
|--------|------|---------|
| SessionCleanupCron | `kmaedu-be/apps/auth-service/src/devices/session-cleanup.cron.ts:6-52` | Cron job class with three-step cleanup |
| UserSessionRepository | `kmaedu-be/apps/auth-service/src/devices/repositories/user-session.repository.ts` | Repository with Prisma batch delete/deactivate queries |
| UserSession (model) | `kmaedu-be/apps/auth-service/prisma/schema.prisma` | Session entity definition |

## Unresolved Questions

1. **Distributed lock**: Does the cron use a distributed lock (e.g., Redis) to prevent duplicate execution across multiple auth-service instances?
2. **Schedule configurability**: Can the cron schedule be changed via environment variable, or is it hardcoded?
3. **Logging and alerting**: Are cleanup failures logged to an alerting system (e.g., Sentry, PagerDuty), or only to console?
4. **Transaction isolation**: Are the three cleanup steps wrapped in a Prisma transaction to ensure atomicity?
