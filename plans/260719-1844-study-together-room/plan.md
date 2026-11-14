---
title: Study-Together Room (Phòng học chung)
status: completed
created: 2026-07-19
completed: 2026-07-20
work_type: feature
spec_waived: "SDD mode disabled (takumi.sddMode: off)"
blockedBy: []
blocks: []
---

# Study-Together Room — Plan Overview

Trang web riêng cho nhiều người học chung một phòng: Pomodoro đồng bộ (học/nghỉ/long-break),
nghe nhạc + xem video chung qua YouTube (play/pause/seek sync), live roster (học/nghỉ),
chat ephemeral, leaderboard thời gian tập trung. Host + co-host điều khiển. Phòng riêng tư,
join bằng mã 6 số. Transport: **Socket.io/WebSocket** (net-new), fan-out đa instance qua
`@socket.io/redis-adapter`, WS upgrade proxy qua gateway. Web-only (kmaedu-fe).

**Context:** `../260719-1835-study-together-room-brainstorm/brainstorm-study-together-room.md` · `clarifications.md`

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [Prisma StudyRoom models](phase-01-prisma-studyroom-models.md) | ✓ done | — |
| 2 | [Backend REST module (CRUD/join/leaderboard)](phase-02-backend-studyroom-rest-module.md) | ✓ done | 1 |
| 3 | [Backend WS gateway foundation](phase-03-backend-ws-gateway-foundation.md) | ✓ done | 2 |
| 4 | [Backend realtime domain logic](phase-04-backend-realtime-domain-logic.md) | ✓ done | 3 |
| 5 | [Gateway proxy: REST + WS upgrade](phase-05-gateway-proxy-rest-and-ws.md) | ✓ done | 2 (REST), 3 (WS) |
| 6 | [Frontend data layer (api/store/socket hook)](phase-06-frontend-data-layer.md) | ✓ done | 4, 5 |
| 7 | [Frontend Study Room UI](phase-07-frontend-study-room-ui.md) | ✓ done | 6 |
| 8 | [Tests](phase-08-tests.md) | ✓ done | 4, 7 |

Phase 5 và 6 có thể chạy song song sau khi 4 xong (contract events đã cố định ở phase 3–4).

## Key Decisions (sealed)

- Model MỚI `StudyRoom` + `StudyRoomMember` — KHÔNG dùng lại ExamRoom; KHÔNG có model chat (ephemeral Redis).
- Live state (timer/media/chat/presence) sống ở **Redis**, DB chỉ giữ cấu hình phòng + membership + totalFocusSeconds.
- Timer **tất định**: server chỉ giữ `{phase, cycle, phaseStartedAt, running}`; client tự tính đếm ngược — không tick qua mạng.
- WS auth bằng JWT qua socket.io handshake (`handshake.auth.token`); mọi lệnh điều khiển kiểm role HOST/COHOST ở server.
- Socket.io path riêng `/ws/study` để gateway proxy upgrade chọn lọc, không đụng route HTTP.

## Risks (watch)

1. Gateway WS upgrade proxy là net-new — smoke-test sớm nhất có thể (phase 5).
2. Multi-instance: thiếu redis-adapter là events "mất người" — bắt buộc từ phase 3.
3. Drift video: client seek theo `positionSec + (now − updatedAt)`, hiệu chỉnh khi lệch >2s.
4. Presence ma: disconnect event + heartbeat TTL 60s dọn thành viên rớt mạng.
5. Reconnect phải nhận `room:snapshot` đầy đủ để khôi phục timer/media/roster ngay.

## Success Criteria

- 2+ client cùng phòng: host start/pause timer, đổi/play/pause/seek video → mọi client cập nhật <1s.
- Reconnect nhận snapshot đúng pha timer; MEMBER bị server từ chối lệnh điều khiển; co-host thao tác được.
- `totalFocusSeconds` cộng dồn đúng → leaderboard chính xác; build + lint + tests xanh cả FE/BE.

## Review round 2 (2026-07-20 — perf/security, đã fix)

- Redact `inviteCode` khỏi REST cho role < COHOST (leak) · membership cache 60s cho `assertRole` (hết per-event DB hit) · room-config cache 60s (hết findRoom mỗi heartbeat) · WS CORS allowlist + fail-fast prod (chống CSWSH, cookie sameSite=none) · rate-limit lệnh WS control 250ms + upgrade flood guard per-IP ở gateway + `@Throttle(5/min)` route join + `crypto.randomInt` · presence & focus-flush bỏ Redis SCAN → Set-based O(size phòng).

## Unresolved / Follow-ups

- **Prisma migration:** Phase 1 adds `createdBy` + `updatedBy` to `StudyRoom` schema (post-review fix for `BaseRepository.update`). Migration must be applied manually on target DB (`yarn prisma:migrate` on remote; shared DB at `sv.fayedark.com`).
- **Multi-instance WS smoke test:** Gateway WS upgrade proxy via http-proxy is net-new. Recommend smoke test with 2+ instances behind gateway before production.
- **Optional zod validation on WS payloads:** Reviewer flagged defensive-only; can be added later for stricter input validation on all socket events.
- **Existing test failure unrelated:** `admin-stats.service.spec.ts` has pre-existing date-dependent failure (not caused by this feature).
