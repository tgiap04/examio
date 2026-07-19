---
title: Study-Together Room (Phòng học chung)
status: pending
created: 2026-07-19
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
`@socket.io/redis-adapter`, WS upgrade proxy qua gateway. Web-only (examio-fe).

**Context:** `../260719-1835-study-together-room-brainstorm/brainstorm-study-together-room.md` · `clarifications.md`

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [Prisma StudyRoom models](phase-01-prisma-studyroom-models.md) | pending | — |
| 2 | [Backend REST module (CRUD/join/leaderboard)](phase-02-backend-studyroom-rest-module.md) | pending | 1 |
| 3 | [Backend WS gateway foundation](phase-03-backend-ws-gateway-foundation.md) | pending | 2 |
| 4 | [Backend realtime domain logic](phase-04-backend-realtime-domain-logic.md) | pending | 3 |
| 5 | [Gateway proxy: REST + WS upgrade](phase-05-gateway-proxy-rest-and-ws.md) | pending | 2 (REST), 3 (WS) |
| 6 | [Frontend data layer (api/store/socket hook)](phase-06-frontend-data-layer.md) | pending | 4, 5 |
| 7 | [Frontend Study Room UI](phase-07-frontend-study-room-ui.md) | pending | 6 |
| 8 | [Tests](phase-08-tests.md) | pending | 4, 7 |

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
