# Phase 03 — Backend WS Gateway Foundation (Socket.io)

## Context Links

- Plan: [plan.md](plan.md) · Depends: phase-02
- Redis service sẵn có: `examio-be/libs/redis/src/redis.service.ts` (ioredis)
- Auth JWT helpers: `@examio/common` (xem AuthGuard hiện dùng verify thế nào — dùng chung secret/logic)

## Overview

- **Priority:** High · **Status:** ✓ done
- Net-new: đưa Socket.io vào exam-service. Nền móng: adapter Redis, auth handshake, join/leave phòng, snapshot, presence. Domain logic (timer/media/chat) ở phase 4.
- Socket.io path `/ws/study` configured; RedisIoAdapter for multi-instance; JWT auth via handshake; event contract in study-room.events.ts.

## Key Insights

- Codebase CHƯA từng có WS — đây là dependency mới, giữ bề mặt nhỏ và cô lập trong module study-room.
- **Path socket.io tuỳ chỉnh `/ws/study`** để gateway (phase 5) proxy upgrade chọn lọc.
- Redis adapter BẮT BUỘC ngay từ đầu: exam-service có thể chạy nhiều instance.

## Implementation Steps

1. Deps (root `examio-be/package.json`): `@nestjs/websockets`, `@nestjs/platform-socket.io`, `@socket.io/redis-adapter`, `socket.io`.
2. Tạo `study-room.gateway.ts` trong module study-room:

```typescript
@WebSocketGateway({
    path: '/ws/study',
    cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? true, credentials: true },
})
export class StudyRoomGateway implements OnGatewayConnection, OnGatewayDisconnect { ... }
```

3. Redis adapter: trong `main.ts` của exam-service dùng custom `IoAdapter` (`RedisIoAdapter extends IoAdapter`) — `createAdapter(pubClient, subClient)` từ 2 connection ioredis (duplicate từ config Redis hiện có).
4. Auth handshake: middleware `io.use()` hoặc trong `handleConnection` — đọc `socket.handshake.auth.token`, verify JWT bằng cùng secret/service AuthGuard đang dùng; gắn `socket.data.userId`. Fail → `socket.disconnect(true)`.
5. `room:join` handler: payload `{roomId}` → kiểm `StudyRoomMember` tồn tại (qua repository phase 2, cache 60s trong Redis để tránh query mỗi lần) → `socket.join(roomId)` → emit `room:snapshot` cho socket đó (đọc live state Redis — phase 4 fill nội dung) → broadcast `presence:updated {userId, online: true, status}` cho phòng.
6. `handleDisconnect`: rời mọi phòng đã join → broadcast `presence:updated {userId, online: false}`; flush focus-credit dở dang (hook để phase 4 cài).
7. Presence heartbeat: client emit `presence:heartbeat {status: 'studying'|'break'}` mỗi 30s → SET `studyroom:{id}:presence:{userId}` = status, `EX 90`. Roster đọc bằng `SCAN`/pipeline khi build snapshot.
8. Event catalog + payload types đặt tại `study-room.events.ts` (một nguồn sự thật, FE mirror lại — ghi rõ trong file).

## Event Contract (foundation)

- Client→Server: `room:join {roomId}`, `room:leave`, `presence:heartbeat {status}`
- Server→Client: `room:snapshot {room, roster, timer, media, chat}`, `presence:updated`, `error {code, message}`

## Todo

- [x] Deps cài + build (socket.io, @nestjs/websockets, redis-adapter)
- [x] RedisIoAdapter trong main.ts exam-service
- [x] Gateway: auth handshake JWT (study-room-socket-auth.service)
- [x] room:join / room:leave / disconnect + presence broadcast
- [x] Heartbeat TTL 60s
- [x] study-room.events.ts (contract)

## Success Criteria

- 2 socket client (script test bằng `socket.io-client`) connect với JWT hợp lệ, join cùng phòng, thấy `presence:updated` của nhau; token sai bị disconnect; kill client → presence offline sau disconnect event.

## Risks

- Verify JWT: PHẢI tái dùng logic/secret của AuthGuard hiện có, không tự chế. Nếu auth dùng cookie-session thì đọc kỹ guard trước khi code — chỉnh handshake cho khớp (fallback: FE gửi access token qua `auth.token`).
- Adapter sai config → events chỉ tới client cùng instance; test với 2 instance dev nếu được.
