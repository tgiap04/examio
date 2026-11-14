# Phase 03 — Messaging Foundation

## Context Links
- Brief: [reports/planner-brief.md](./reports/planner-brief.md) (§03)
- Red team: [reports/red-team-changes.md](./reports/red-team-changes.md) RT-2, RT-10, RT-15 (authoritative over this file's earlier text and the brief)
- Research: [researcher-02](./research/researcher-02-migration-mechanics-report.md) §3 (outbox, relay SQL, idempotent consumer, topology)
- ARCHITECTURE.md §6.3 (topology, envelope, event catalog), §8.3 (ROLE), §9.2 (register → wallet flow)
- Scout: [current state](./reports/scout-current-state-report.md) "gRPC / events"

## Overview
- Priority: P1 · Status: Completed (2026-10-18) · Effort: 2.5d <!-- Red Team: RT-2, RT-10 (was 2d: +per-service broker users, +claim-then-publish relay, +purge, +source/version rules; −Python helper, −2 retry tiers, −traceparent) --> · Depends on: 02
- Build `libs/messaging`: envelope v1, transactional outbox + claim-then-publish relay, confirm publisher, idempotent consumer with source validation, ONE TTL retry tier, DLQ, daily purge. Add `ROLE=worker`. One RabbitMQ user per service with topic permissions. Move the one live event (`user.created`, auth → finance) to `auth.user.registered` via the outbox.

## Key Insights
- Today `libs/common/src/events/` (442 lines): exchange `kmaedu.events`. Auth publishes `USER_CREATED` fire-and-forget after commit (`auth.service.ts:196-208, 613-625`). Finance subscribes (`finance-service/src/events/user-event.handler.ts:29-80`). The subscriber always acks, with no DLQ and no outbox.
- Old-lib users that stay until phase 15: Python `rabbitmq_consumer.py` (queue `ai-service-queue`, binds `ai.ocr.requested`, publishes `ai.generation.*`/`ai.ocr.*` on `kmaedu.events`, `rabbitmq_consumer.py:22-25,236-297`); exam imports the old `EventsModule` (`exam-service.module.ts`, `modules/ai/ai.module.ts`), whose subscriber declares a queue named `SERVICE_NAME` (`event-subscriber.service.ts:29-32`). Do not delete `libs/common/src/events` here; delete only the `USER_CREATED` pieces.
- RabbitMQ today: one default user from `RABBITMQ_DEFAULT_USER/PASS` (`deploy/docker-compose.yml:351-357`), shared by every service. Any service can publish any routing key, so `source` in an envelope proves nothing. <!-- Red Team: RT-2 -->
- RabbitMQ skips creating the default user when definitions are imported at boot, so the ops/admin user must be in the definitions file too. <!-- Red Team: RT-2 -->
- Publishing to the default exchange (`amq.default`) needs write on it, and that write reaches every queue by name, bypassing topic permissions. So retry and dead-letter routing use per-service fanout exchanges, never `""`. Fanout + no `x-dead-letter-routing-key` keeps the original routing key through dead-lettering. <!-- Red Team: RT-2 -->
- The DB is still shared (one schema) until phase 11. So `outbox_events` is one table with a `source` column, and each service relays only its own rows. `processed_events` key = `(consumer, event_id)`. After phase 11 each schema has its own copy and `consumer` stays harmless.
- `amqp-connection-manager` 5.0.1 `createChannel({json:true})` uses a confirm channel by default. `publish` resolves on broker ack (researcher-02 §3).
- Publishing inside a DB tx holds row locks for the broker round-trip. Claim-then-publish keeps the tx to two short statements. <!-- Red Team: RT-10 -->
- `$queryRaw` returns `bigint` → cast `seq::text`.

## Requirements
- Functional:
  - Envelope `{ id: "evt_<ulid>", type, version: 1, occurredAt, source, correlationId, data }`. `version` is the envelope schema version. AMQP props: `messageId=id`, `persistent`, `contentType=application/json`. No `traceparent` header (deferred to phase 17). <!-- Red Team: RT-10 -->
  - State events vs facts <!-- Red Team: RT-10, RT-15 -->:
    - Fact events (`auth.user.registered`) need no ordering.
    - State events (every `*.updated`, `*.authz_changed`, `*.changed`) <!-- Reconcile: X2 --> carry `data.version`: the aggregate `updatedAt` in ms, or `authzVersion` for authz events (where `data.authzVersion` is the version).
    - `libs/messaging` keeps a `STATE_EVENT_TYPES` registry. `createEnvelope` throws for a registered state type without a numeric version.
    - Consumers apply a state event only if its version is newer than what they hold. Ban/kick handlers re-read authoritative state instead of trusting the payload.
  - `OutboxService.add(tx, type, data)` writes inside the caller's Prisma tx. `libs/messaging` stays Prisma-free: structural param `{ outboxEvent: { create } }`.
  - Relay (worker role, claim-then-publish) <!-- Red Team: RT-10 -->:
    1. Claim tx (short, commit): `UPDATE outbox_events SET locked_until = now() + interval '30 seconds' WHERE seq IN (SELECT seq FROM outbox_events WHERE source = $svc AND published_at IS NULL AND next_attempt_at <= now() AND (locked_until IS NULL OR locked_until < now()) ORDER BY seq LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING seq::text, envelope, attempts`.
    2. Publish OUTSIDE any tx, with confirms.
    3. Mark: confirmed rows → `published_at = now(), locked_until = NULL`. Failed rows → `attempts+1`, `next_attempt_at = now() + min(2^attempts, 300)s`, `last_error`, `locked_until = NULL`.
    - A crash between publish and mark re-publishes after the lock expires. The idempotent consumer absorbs the duplicate.
    - Polls every 500 ms. Uses its own `pg.Pool({ max: 2 })` (not the API's Prisma pool), so relay load never starves request handling.
  - Consumer `@EventHandler('<type>', { dedupe?: boolean })`:
    - Source validation <!-- Red Team: RT-2 -->: `envelope.type` must equal the routing key, and `envelope.source` must equal the routing key's first segment (the domain). Mismatch → `PermanentEventError('SOURCE_MISMATCH')` → DLQ + `error` log. Topic permissions stop a service from publishing another domain's keys, so a validated `source` cannot be forged.
    - `dedupe: true` (default), in one tx: `INSERT processed_events(consumer,event_id) ON CONFLICT DO NOTHING`. Zero rows → ack (duplicate). Otherwise run the handler with `(envelope, tx)` and ack after commit.
    - `dedupe: false` is for handlers that are idempotent by construction and have no DB (gateway `SET`-if-greater, phase 05): handler gets `(envelope)` only.
    - Transient error → republish to `<svc>.retry` with `x-retry-count+1` and the original routing key, then ack.
    - Count ≥ 5 or `PermanentEventError` → `nack(requeue=false)` → `<svc>.dlq`.
  - Topology, declared idempotently at start (per service) <!-- Red Team: RT-2, RT-10 -->:
    - `kmaedu.events` (topic, durable), shared.
    - `<svc>.events` queue, args `x-dead-letter-exchange=<svc>.dead`. Prefetch 10.
    - `<svc>.retry` (fanout) → `<svc>.retry.30s` (args `x-message-ttl=30000`, `x-dead-letter-exchange=<svc>.requeue`).
    - `<svc>.requeue` (fanout) → `<svc>.events`.
    - `<svc>.dead` (fanout) → `<svc>.dlq`.
    - ONE retry tier (30 s × max 5 attempts). Add tiers only when a real flow needs them.
  - RabbitMQ users (definitions file loaded at broker boot) <!-- Red Team: RT-2 -->:
    - One user per service: `auth`, `finance`, `exam`, `ai` (phase 05 adds `gateway`; phases 12–15 add theirs), plus the ops `admin` user (tag `administrator`, from `RABBITMQ_USER/PASS`). No app uses the ops user.
    - Per user on vhost `/`: configure, write and read = `^(kmaedu\.events|<svc>\..*)$`.
    - Topic permissions on `kmaedu.events`: write `^<domain>\.` (own prefix only), read `.*`.
    - Legacy, until phase 15 removes the old lib: `ai` also gets `ai-service-queue` in configure/read; `exam` also gets its old `SERVICE_NAME` queue.
    - Each service connects with `RABBITMQ_URL=amqp://<svc>:<pass>@rabbitmq:5672`.
  - Daily purge (worker role, 03:00) <!-- Red Team: RT-10 -->: delete `outbox_events` published more than 7 days ago and `processed_events` older than 14 days, in batches of 5 000 until 0 rows. Uses the relay pool.
  - `ROLE` env: `api` | `worker` | `api,worker` (default `api,worker` for now; split containers in 16).
  - `auth.user.registered` data `{ userId, email, username, utmSource|null }` is written to the outbox in the register tx (email + Google OAuth paths). Finance binds `auth.user.registered` and keeps today's effect (wallet 20 credits + welcome tx) until phase 04 moves provisioning to `auth.user.authz_changed` (`role=TEACHER`). <!-- Reconcile: X2 -->
- Non-functional: no event loss between DB commit and broker outage. Duplicate deliveries are harmless. An alert hook (log at `error` level) fires when any row stays unpublished for more than 5 minutes. No DB lock is held across a broker call. <!-- Red Team: RT-10 -->

## Architecture
```
auth API ─ BEGIN; INSERT User; INSERT outbox_events(source=auth, type=auth.user.registered); COMMIT
auth worker ─ relay: claim tx (locked_until) COMMIT → confirm publish kmaedu.events/auth.user.registered (user auth, topic ^auth\.) → UPDATE published_at
RabbitMQ ─► finance.events ─► finance worker: validate source; BEGIN; INSERT processed_events(finance, evt.id); create wallet; COMMIT; ack
              fail ─► finance.retry ─► finance.retry.30s (TTL) ─► finance.requeue ─► finance.events ; ≥5 ─► finance.dead ─► finance.dlq
```
<!-- Red Team: RT-2, RT-10 -->
Prisma models (`libs/database/src/models/messaging.prisma`, shared until 11):
```prisma
model OutboxEvent {
  seq BigInt @id @default(autoincrement())
  id String @unique
  source String
  type String
  envelope Json
  attempts Int @default(0)
  nextAttemptAt DateTime @default(now()) @map("next_attempt_at")
  lockedUntil DateTime? @map("locked_until") // Red Team: RT-10
  lastError String? @map("last_error")
  createdAt DateTime @default(now()) @map("created_at")
  publishedAt DateTime? @map("published_at")
  @@index([source, publishedAt, nextAttemptAt])
  @@map("outbox_events")
}
model ProcessedEvent { consumer String  eventId String @map("event_id")  processedAt DateTime @default(now()) @map("processed_at")
  @@id([consumer, eventId]) @@index([processedAt]) @@map("processed_events") }
```
Broker definitions <!-- Red Team: RT-2 -->: `deploy/rabbitmq/definitions.template.json` (committed, no secrets) → `deploy/rabbitmq/render-definitions.cjs` reads `RABBITMQ_<SVC>_PASS` + `RABBITMQ_USER/PASS` and writes `definitions.json` (gitignored) with `rabbit_password_hashing_sha256` hashes → mounted read-only. `rabbitmq.conf`: `load_definitions = /etc/rabbitmq/definitions.json`, `definitions.skip_if_unchanged = true`.

## Related Code Files
File ownership (globs): `kmaedu-be/libs/messaging/**`, `kmaedu-be/libs/database/src/models/messaging.prisma`, `kmaedu-be/libs/database/src/migrations/*_messaging/**`, `kmaedu-be/proto/kmaedu/events/**`, `kmaedu-be/apps/auth-service/src/{auth.service.ts,auth.module.ts,main.ts,worker.module.ts}`, `kmaedu-be/apps/finance-service/src/{events/**,finance-service.module.ts,main.ts,worker.module.ts}`, `kmaedu-be/libs/common/src/events/event-types.ts` (USER_CREATED removal only), `kmaedu-be/deploy/rabbitmq/**`, `kmaedu-be/deploy/docker-compose.yml` (`rabbitmq` service + per-service `RABBITMQ_URL` + `ROLE` env only), `kmaedu-be/.gitignore` (one line), `kmaedu-be/deploy/{.env.example,setup-env.sh}` (broker passwords + render step), `/.github/workflows/deploy.yml` (render step before `up` only). <!-- Red Team: RT-2, RT-10 -->

- Create:
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/messaging/src/{index.ts,envelope.ts,state-event-types.ts,outbox.service.ts,outbox-relay.service.ts,outbox-purge.service.ts,relay-pool.ts,amqp-connection.ts,topology.ts,event-handler.decorator.ts,event-consumer.service.ts,errors.ts,messaging.module.ts}` <!-- Red Team: RT-10 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/database/src/models/messaging.prisma`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/database/src/migrations/<ts>_messaging/migration.sql` (hand-edit: partial index `WHERE published_at IS NULL`)
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/proto/kmaedu/events/v1/auth_events.proto` (`UserRegistered`; `UserAuthzChanged` added in 04) <!-- Reconcile: X2 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/auth-service/src/worker.module.ts`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/finance-service/src/worker.module.ts`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/finance-service/src/events/handlers/user-registered.handler.ts`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/deploy/rabbitmq/{rabbitmq.conf,definitions.template.json,render-definitions.cjs,render-definitions.spec.cjs}` <!-- Red Team: RT-2 -->
- Modify:
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/auth-service/src/auth.service.ts` (register + OAuth: outbox in tx; remove fire-and-forget publish)
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/auth-service/src/{auth.module.ts,main.ts}`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/finance-service/src/{finance-service.module.ts,main.ts}`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/common/src/events/event-types.ts` (drop `USER_CREATED`)
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/{tsconfig.json,jest.config.js}` (`@kmaedu/messaging` alias), `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/deploy/docker-compose.yml` (rabbitmq mounts, per-service `RABBITMQ_URL`, `ROLE`), `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/.gitignore` (`deploy/rabbitmq/definitions.json`) <!-- Red Team: RT-2 -->
- Delete:
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/finance-service/src/events/user-event.handler.ts` (replaced)

## Implementation Steps
1. Write the failing unit tests (see Tests).
2. `envelope.ts`: `createEnvelope(type, data, ctx)` with ulid ids; throws for a `STATE_EVENT_TYPES` entry without a numeric version. `parseEnvelope(raw)` validates with zod and rejects `version !== 1` as permanent. <!-- Red Team: RT-10 -->
3. `amqp-connection.ts`: one `AmqpConnectionManager` per process from `RABBITMQ_URL`, plus one confirm channel whose `setup` calls `topology.declare(svc, bindings)` (the exchanges and queues in Requirements; never the default exchange). <!-- Red Team: RT-2 -->
4. `relay-pool.ts`: `pg.Pool({ max: 2 })` (`pg` is added in phase 01, RT-14) from `DATABASE_URL` with Prisma-only query params (`schema`, `connection_limit`) stripped [UNVERIFIED: confirm `pg` ignores or rejects them; after phase 11 pass `options=-c search_path=<schema>`]. `outbox.service.ts` (`add`). `outbox-relay.service.ts`: claim / publish / mark loop from Requirements, `OnApplicationShutdown` stop, stale alert at >5 min. `outbox-purge.service.ts`: daily batched deletes scheduled with `node-cron` (already used by `auth-service/src/devices/session-cleanup.cron.ts:2`). <!-- Red Team: RT-10 -->
5. `event-consumer.service.ts`:
   - discovers `@EventHandler` methods via `DiscoveryService`;
   - consumes `<svc>.events`;
   - validates `type`/`source` against the routing key;
   - idempotency tx (unless `dedupe:false`);
   - retry via `<svc>.retry` by `x-retry-count`, DLQ via nack.
   <!-- Red Team: RT-2, RT-10 -->
6. Prisma: add `messaging.prisma`, `yarn prisma:merge`, then `prisma migrate dev --create-only --name messaging`. Hand-edit the partial index.
7. Broker users <!-- Red Team: RT-2 -->:
   - Write `definitions.template.json` (users `admin`, `auth`, `finance`, `exam`, `ai`; permissions + topic permissions per Requirements, legacy queues for `ai`/`exam`).
   - Write `render-definitions.cjs`: hash = base64(salt4 ‖ sha256(salt4 ‖ password)), fails fast on any missing password.
   - Compose: mount `rabbitmq.conf` + rendered `definitions.json`; set `RABBITMQ_URL` per service (auth, finance, exam, ai); add the render step to `deploy/setup-env.sh` and the deploy job before `docker compose up`.
8. Auth:
   - In `register` and the Google OAuth create path, call `outbox.add(tx, 'auth.user.registered', {...})` inside the existing `$transaction`.
   - Delete the post-commit `publishAuthEvent(USER_CREATED…)`.
   - `main.ts` reads `ROLE`: `api` → HTTP+gRPC, `worker` → `NestFactory.createApplicationContext(WorkerModule)` with the relay + purge.
9. Finance: `user-registered.handler.ts` with `@EventHandler('auth.user.registered')` ports the logic from `user-event.handler.ts:42-80` and makes it idempotent (skip if a wallet exists). `WorkerModule` hosts the consumer.
10. Compose: `ROLE=api,worker` for auth and finance.

## Tests
- Write first (unit, no broker):
  - `libs/messaging/src/envelope.spec.ts`: shape, ulid prefix, rejects version 2, state type without `data.version` throws. <!-- Red Team: RT-10 -->
  - `libs/messaging/src/event-consumer.service.spec.ts` (fake channel):
    - duplicate id → handler not called, message acked;
    - transient error, count 0 → published to `finance.retry` with the original routing key, then acked; <!-- Red Team: RT-10 -->
    - count 5 → `nack(false,false)`;
    - `PermanentEventError` → DLQ immediately;
    - `source: "exam"` on routing key `auth.user.registered` → DLQ, handler not called; <!-- Red Team: RT-2 -->
    - `dedupe:false` handler → no `processed_events` write.
  - `libs/messaging/src/outbox-relay.service.spec.ts` (fake pool + publisher) <!-- Red Team: RT-10 -->:
    - the claim commits before the first publish (call order asserted);
    - partial confirm failure → only fulfilled rows marked, failed rows get `attempts+1` and `locked_until = NULL`.
  - `deploy/rabbitmq/render-definitions.spec.cjs`: a known password + salt gives the RabbitMQ reference hash; a missing password → exit 1. <!-- Red Team: RT-2 -->
- Integration (`apps/finance-service/test/user-registered.e2e-spec.ts`, real Postgres + RabbitMQ from the CI containers, loaded with the rendered definitions):
  - publish the same envelope twice → exactly 1 wallet + 1 welcome tx (money path, required);
  - stop the consumer mid-run → message retried after ~30 s, no double credit;
  - <!-- Red Team: RT-2 --> connected as `finance`, publish `auth.user.registered` → channel closed with `ACCESS_REFUSED`; connected as `finance`, consume `auth.events` → `ACCESS_REFUSED`.
- Integration (`apps/auth-service/test/register-outbox.e2e-spec.ts`): register → one `outbox_events` row, source `auth`. The relay publishes it and sets `published_at`. A row whose `locked_until` is in the future is skipped; one past it is re-claimed. <!-- Red Team: RT-10 -->
- Integration (`libs/messaging/test/outbox-purge.e2e-spec.ts`): rows published 8 days ago and processed 15 days ago are deleted; newer rows and unpublished rows stay. <!-- Red Team: RT-10 -->

## Todo List
- [x] Failing unit tests for envelope/consumer/relay/render script
- [x] libs/messaging implementation + alias (claim-then-publish relay, relay pool, purge, source validation, state-event registry) <!-- Red Team: RT-2, RT-10 -->
- [x] messaging.prisma + migration (partial index, `locked_until`)
- [x] Per-service RabbitMQ users: definitions template + render script + compose wiring <!-- Red Team: RT-2 -->
- [x] auth register/OAuth → outbox; fire-and-forget removed
- [x] ROLE=worker entry (auth, finance)
- [x] finance `auth.user.registered` handler (idempotent)
- [x] e2e: duplicate delivery → single wallet credit; cross-domain publish refused

## Success Criteria
- `cd kmaedu-be && yarn typecheck && yarn build:all && yarn test`: exit 0.
- `cd kmaedu-be/apps/finance-service && ../../node_modules/.bin/jest --config test/jest-e2e.json test/user-registered.e2e-spec.ts`: exit 0.
- Manual: stop RabbitMQ, register a user (201), start RabbitMQ → the wallet appears within 5 s. The RabbitMQ UI shows `finance.events`, `finance.retry.30s`, `finance.dlq`, and users `auth`, `finance`, `exam`, `ai`, `admin`. <!-- Red Team: RT-2, RT-10 -->
- `rabbitmqctl list_topic_permissions` → `finance` write `^finance\.` on `kmaedu.events`. <!-- Red Team: RT-2 -->
- `grep -rn "USER_CREATED" kmaedu-be/apps kmaedu-be/libs` → no hits. `grep -rn "traceparent\|amq.default" kmaedu-be/libs/messaging/src` → no hits. <!-- Red Team: RT-10 -->
- `git -C kmaedu-be check-ignore deploy/rabbitmq/definitions.json` → prints the path (never committed). <!-- Red Team: RT-2 -->

## Risk Assessment
- Queue argument mismatch with already-declared queues (PRECONDITION_FAILED) → Medium. New queue names (`finance.events`) avoid old ones. Locally: `docker compose down -v` resets the broker. Production: the phase-16 cutover drops the RabbitMQ volume, so old queues never coexist with new ones. <!-- Updated: Validation Session 1 - single production deploy -->
- <!-- Red Team: RT-2 --> Broker permission too tight → a service fails at boot with `ACCESS_REFUSED` → Medium/High. Countermove: the e2e runs against the rendered definitions; the failure is loud at startup, not silent; legacy queues are listed explicitly.
- <!-- Red Team: RT-2 --> Definitions import replaces the default user → ops lose UI access if `RABBITMQ_USER/PASS` is missing. Countermove: render fails fast on any missing password.
- <!-- Red Team: RT-10 --> Relay crash after publish, before mark → duplicate publish after 30 s. Accepted: consumers dedupe on `event_id`.
- <!-- Red Team: RT-10 --> Purge deletes a `processed_events` row whose event is still in flight → only possible for >14-day-old events; the outbox stops redelivering after publish, and retries end after 5 × 30 s.
- Ordering across retries is not guaranteed → events are facts or versioned state; handlers are idempotent/upsert-style and apply state only if newer. <!-- Red Team: RT-10 -->

## Rollback
- Revert the auth commit (restores fire-and-forget) and the finance handler commit. Leave the outbox tables (harmless).
- `ROLE` defaults to `api,worker`, so removing the env restores single-process behaviour.
- <!-- Red Team: RT-2 --> Broker users: remove the `load_definitions` mount and point `RABBITMQ_URL` back at the ops user. The per-service users stay in the broker (harmless).

## Security Considerations
- Envelopes carry email (PII). Never log `data` at info level; log `id`, `type`, `source`.
- <!-- Red Team: RT-2 --> Per-service RabbitMQ users (moved here from 16): a service can publish only its own domain prefix and read only its own queues. Consumers reject a `source` that disagrees with the routing key. Broker passwords stay env-only; the committed template holds no secrets; the rendered file is gitignored.
- DLQ messages hold PII. Replay tooling (phase 16) must be admin-only.

## Next Steps
- Unblocks 04 (`auth.user.authz_changed` via outbox + finance provisioning consumer). <!-- Red Team: RT-3 --> <!-- Reconcile: X2 -->
- [CROSS-PHASE] `libs/common/src/events` stays for ai-service (`ai.*`) until phase 15, which must delete it, move those flows onto `libs/messaging`, drop the legacy queue entries from the definitions template, and own the Python envelope helper (moved there from this phase, RT-10).
- [CROSS-PHASE] Phase 05 adds RabbitMQ user `gateway` (consumes `auth.user.authz_changed`, `dedupe:false`); phases 12–15 add their users to `definitions.template.json` with the same pattern. <!-- Red Team: RT-2 -->
- [CROSS-PHASE] Phase 11 must recreate `outbox_events` / `processed_events` per service schema (keep `consumer` column or drop it), with no data carry-over (DB reset), and set the relay pool `search_path`.
- [CROSS-PHASE] `traceparent` propagation is deferred to phase 17 (RT-10).

### Deferred / carried (from Phase 03 close-out, 2026-10-18; inspection SEALED 9/10, 0 critical)
1. Outbox rows have no max-attempts or parked state: a permanently failing row retries every 5 min forever, and only the stale alert surfaces it. Consider in P16.
2. Relay batch publishes concurrently (`Promise.allSettled`), so there is no strict per-aggregate order at the broker. State events rely on `data.version`.
3. Consumer `handleMessage` is not drained at shutdown. Safe via broker redelivery + `processed_events` dedupe.
4. The existing deployed `rabbitmq_data` volume needs a one-time cleanup at cutover (old default user + orphan `finance.user.created` queue). Owner: P16 runbook.
5. Docker Desktop erlang-cookie EACCES on this host (bind-mounted data dirs only; compose uses a named volume). Verify on the CI runner.
6. Outage-drill timing: wallet credited 257 ms after broker ready (5.6 s including broker boot).
7. CI/deploy messaging changes (`deploy.yml` render step, compose wiring) not yet run on GitHub or the VPS. Owner: lead, before P16.
