---
title: "260719-1835-study-together-room-brainstorm"
session_date: 2026-07-19
plan: plans/260719-1844-study-together-room/
status: plan_complete
---

# Session Journal — 260719-1835-study-together-room-brainstorm

## What

Brainstorm + blueprint for NEW feature **Study-Together Room** (phòng học chung): a dedicated web page where multiple users study together with synchronized Pomodoro timer (work/break/long-break), shared YouTube media (play/pause/seek sync), live roster (studying/on-break), ephemeral chat, and focus-time leaderboard.

## Key Decisions Locked

1. **Transport:** Socket.io/WebSocket (user's pick over consultant's SSE recommendation). Backend has zero WS infra today (SSE+Redis pub/sub only).
2. **Gateway proxy:** Net-new WS upgrade on gateway-service, path `/ws/study`, websocket-only. Flagged as riskiest → Phase 5 starts with a spike.
3. **Chat:** Ephemeral Redis LIST (capped 200 messages), NO StudyRoomMessage Prisma model.
4. **Pomodoro:** Work/Break/Long-Break cycles baked in from day 1 (longBreakMinutes, cyclesBeforeLongBreak fields).
5. **State architecture:** Live state (timer phase/cycle, media play position, chat, presence) lives in Redis; Prisma holds StudyRoom + StudyRoomMember metadata only.
6. **Deterministic timer:** Server stores {phase, cycle, phaseStartedAt, running}; clients compute countdown locally, normalize on read.
7. **Focus-time credit:** 30s heartbeat increments Redis counter, flushed to StudyRoomMember.totalFocusSeconds on room close.
8. **Scope:** Web only (kmaedu-fe); private rooms, 6-digit invite code, ~10–20 capacity, host+cohost controls; WebRTC excluded.

## Artifacts

- `plans/260719-1835-study-together-room-brainstorm/brainstorm-study-together-room.md` — consultation record, two scout reports (no WS infra; gateway SSE passthrough only).
- `plans/260719-1844-study-together-room/plan.md + phase-01..08` — 8-phase delivery chain (1→2→3→{4,5}→6→7→8); clarifications.md sealed; spec_waived.

## Lesson

Brainstorm-first paid off. Scout reports surfaced the transport gap early (zero WS anywhere), turning the Socket.io decision into an **informed trade-off** rather than a guess. Backend infra is greenfield; this is load-bearing.

## Next

`/tkm:takumi plans/260719-1844-study-together-room`

---

**Status:** DONE  
**Summary:** Study-Together Room brainstorm + plan complete. Key risk (WS gateway spike) identified. Ready for implementation dispatch.
