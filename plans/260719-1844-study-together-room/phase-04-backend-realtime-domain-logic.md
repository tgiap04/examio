# Phase 04 — Backend Realtime Domain Logic (Timer / Media / Chat / Roles / Focus)

## Context Links

- Plan: [plan.md](plan.md) · Depends: phase-03
- Role helper `assertRole` từ phase-02; event contract `study-room.events.ts` từ phase-03

## Overview

- **Priority:** High · **Status:** ✓ done
- Toàn bộ hành vi phòng: Pomodoro state machine, đồng bộ YouTube, chat ephemeral, uỷ quyền co-host, tích luỹ thời gian tập trung.
- Post-review fixes: server-side allowFocusCredit throttle (SET NX EX 25); focus flush now atomic (GETDEL); timer:config clamps to DTO bounds; YouTube regex anchored.

## Architecture — Redis live state (nguồn sự thật runtime)

| Key | Value | TTL |
|---|---|---|
| `studyroom:{id}:timer` | JSON `{phase:'work'\|'break'\|'longbreak', cycle:number, phaseStartedAt:epochMs, running:boolean, pausedRemainingMs?:number}` | 24h, refresh khi ghi |
| `studyroom:{id}:media` | JSON `{url, playing:boolean, positionSec:number, updatedAt:epochMs}` | 24h |
| `studyroom:{id}:chat` | LIST JSON `{userId, name, content, at}` — LPUSH + LTRIM 0..199 | 24h |
| `studyroom:{id}:presence:{userId}` | `'studying'\|'break'` | 90s (phase 3) |
| `studyroom:{id}:focus:{userId}` | INT giây chưa flush | 24h |

**Timer tất định:** server KHÔNG tick. Client tự tính pha hiện tại từ `phaseStartedAt + config` (nhảy pha work→break→…→longbreak theo `cyclesBeforeLongBreak`). Server chỉ ghi state khi có LỆNH (start/pause/reset/config) và broadcast. Khi client tính ra chuyển pha, KHÔNG cần server xác nhận — mọi client cùng công thức → cùng kết quả. Lazily-normalize: khi đọc snapshot, service tính pha thực tại từ elapsed để trả state đã chuẩn hoá.

## Event Contract (bổ sung vào study-room.events.ts)

- Client→Server (HOST/COHOST — server kiểm role, MEMBER bị `error {code:'FORBIDDEN'}`):
  - `timer:start` (từ pause thì resume bằng `pausedRemainingMs`), `timer:pause`, `timer:reset`, `timer:config {workMinutes,...}` (ghi cả vào DB StudyRoom)
  - `media:set {url}` (validate YouTube URL/videoId server-side; ghi `currentMediaUrl` vào DB), `media:play`, `media:pause`, `media:seek {positionSec}`
  - `role:grant {userId}` / `role:revoke {userId}` — chỉ HOST; update `StudyRoomMember.role`
- Client→Server (mọi member): `chat:send {content}` (trim, max 500 ký tự, rate-limit 1 msg/giây/user bằng Redis `SET NX EX 1`)
- Server→Client (broadcast phòng): `timer:updated {timerState}`, `media:updated {mediaState}`, `chat:message {msg}`, `role:updated {userId, role}`, `room:closed`

## Focus-time accumulation (leaderboard)

1. Heartbeat (phase 3) với `status:'studying'` khi timer đang `running` + pha `work` → handler `INCRBY studyroom:{id}:focus:{userId} 30`.
2. Flush về DB (`totalFocusSeconds += x`, reset key): khi user disconnect/leave, và interval 5 phút (một cron nhẹ trong service — `@nestjs/schedule` đã có trong repo? nếu chưa: setInterval trong onModuleInit, cleanup onModuleDestroy).
3. Client chỉ gửi heartbeat 'studying' khi tab visible (FE lo, phase 6) — chống treo máy cày điểm ở mức chấp nhận được.

## Implementation Steps

1. `study-room-state.service.ts` — đọc/ghi các Redis key trên (get/set timer, media, chat push+range, focus incr/flush); dùng `RedisService` từ `@examio/redis`.
2. Handlers trong `study-room.gateway.ts` (giữ gateway mỏng — logic trong state service + `study-room.service.ts`; mỗi file <200 dòng).
3. `room:snapshot` (phase 3) fill đủ: room config (DB), roster (members DB + presence Redis), timer (normalized), media, chat 50 tin gần nhất.
4. Validate YouTube URL: regex bắt `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/playlist?list=` → lưu dạng chuẩn hoá `{videoId | playlistId}`.
5. `room:closed`: khi HOST đặt `isActive=false` (REST phase 2) → service publish event nội bộ → gateway broadcast + `socket.leave` cả phòng. REST và WS cùng process nên gọi thẳng qua service (inject gateway server), không cần RabbitMQ.

## Todo

- [x] study-room-state.service.ts (Redis)
- [x] Timer handlers + normalize-on-read
- [x] Media handlers + YouTube validate (anchored regex)
- [x] Chat handler + rate limit (LTRIM cap 200)
- [x] Focus INCRBY + flush (disconnect + interval; atomic GETDEL)
- [x] Snapshot đầy đủ + room:closed broadcaster
- [x] Dead constant STUDY_ROOM_CONTROL_CHANNEL removed

## Success Criteria

- Script test 2 client: co-host start timer → cả 2 nhận `timer:updated`, pause giữ đúng remaining; member gửi lệnh timer → FORBIDDEN; seek video → client kia nhận đúng position; chat rate-limit hoạt động; focus giây cộng đúng vào DB sau flush.

## Security

- MỌI lệnh điều khiển kiểm role server-side qua `assertRole` (cached). Chat sanitize: FE render text thuần (không HTML). Không tin bất kỳ state nào client gửi ngoài payload đã validate.
