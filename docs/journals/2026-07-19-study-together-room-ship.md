# Study-Together Room Feature — Full Implementation Complete

**Date**: 2026-07-19 14:30
**Severity**: Medium (critical bug caught & fixed)
**Component**: Backend: exam-service + gateway; Frontend: study-room pages + socket integration
**Status**: Complete (awaiting user seal; migration deferred)

## What Happened

Forged all 8 phases of Study-Together Room: Prisma schema (StudyRoom + StudyRoomMember) with createdBy/updatedBy, exam-service `study-room` module (REST CRUD + join-by-6-digit-code + leave + leaderboard), **first WebSocket gateway in this backend** (Socket.io + RedisIoAdapter for multi-instance fan-out), JWT handshake mirroring AuthGuard, deterministic Pomodoro engine (server holds phaseStartedAt+config; clients compute countdown), Redis-only live state (no DB thrash). Gateway added WS upgrade proxy on `/ws/study` (net-new from buffered-HTTP baseline). Frontend: types/api/zustand store/socket hook/pomodoro lib, study-room list & full-screen room UI with panels (timer, YouTube player, roster, chat, leaderboard, settings). Tests: 61 unit tests across 5 suites, all green.

## The Brutal Truth

Felt bulletproof until the reviewer landed a **critical gut-punch**: mocked unit tests hid a schema-contract mismatch. StudyRoom model was missing `createdBy`/`updatedBy` — BaseRepository.update always writes those fields. Against a real DB, close-room / regenerate-code / timer-config would crash. All-mocked repos hide this class of bug. Stung, but caught before merge.

## Technical Details

**Architecture decisions**:
- Socket.io chosen over SSE (Path B) for long-term bidirectional collaboration; cost was net-new WS infra.
- Timer is deterministic: server stores `phaseStartedAt + phaseConfig`; clients compute countdown locally (no network tick needed).
- Redis-only live state (timer, chat, presence, focus) — no DB writes on every event.
- Role enforcement: HOST (owns room, timer control), COHOST (co-manage), MEMBER (join-only).

**Fixes applied**: focus-farming throttle (atomic `GETDEL` focus flush to prevent abuse), WS timer:config clamping to reject out-of-range config, anchored YouTube URL regex for robustness.

**Critical blocker**: Migration NOT applied. DB is remote shared Postgres (sv.fayedark.com); running `prisma migrate dev` against it unilaterally refused as unsafe. Prisma client regenerated so code builds. Migration pending user seal.

## Root Cause Analysis

Schema drift + all-mocked unit tests = blind spot. The BaseRepository pattern (shared across all entities) writes `createdBy`/`updatedBy` on every update — a contract the StudyRoom model violated silently. Lesson: a single integration test against real Prisma would have caught it in Phase 2, not Phase 7.

## Lessons Learned

1. **Mocked repos hide schema contracts** — lean on at least one integration test per new entity to validate Prisma expectations against the actual pattern in use.
2. **WebSocket architecture in a gateway is a net-new complexity surface** — worth it for collaboration, but needs smoke test across multi-instance fan-out (Redis adapter working as specified).
3. **Deterministic timer logic pays off** — no network tick = client-side countdown is robust against jitter; clock skew only matters at transition points (phase flip).
4. **Role + capability matrix should be co-located, not inferred** — caught in code review; now explicitly documented in the WS gateway.

## Next Steps

- User applies Prisma migration against remote DB.
- Multi-instance WS smoke test (spawn 2+ backend instances, verify RedisIoAdapter fan-out).
- Optional: add Zod validation to all WS payloads (Phase 8+ hardening).
- Code committed and pushed upon user green-light.

---

**Status**: DONE
**Summary**: Study-Together Room fully implemented across backend (REST + WebSocket), gateway (WS proxy), and frontend (room UI + socket integration). Critical schema-contract bug caught and fixed pre-merge. Migration deferred to user; no code committed pending seal.
