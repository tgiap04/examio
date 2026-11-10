# Phase 06 — Frontend Data Layer (API / Store / Socket Hook)

## Context Links

- Plan: [plan.md](plan.md) · Depends: phase-04 (event contract), phase-05 (gateway URL)
- Pattern: `kmaedu-fe/src/apis/examRoomApi.ts` (axios wrapper), `src/apis/api.ts` (shared instance + bearer token), `src/stores/useExamSessionStore.ts` (zustand + storeCache)

## Overview

- **Priority:** High · **Status:** ✓ done
- Toàn bộ lớp dữ liệu FE: REST client, zustand store, socket.io hook với reconnect + snapshot. Chưa có UI.
- Auth via httpOnly cookie with withCredentials; pomodoro engine deterministic client-side; socket hook manages reconnect + presence heartbeat + state sync.

## Implementation Steps

1. Dep: `cd kmaedu-fe && yarn add socket.io-client`.
2. `src/types/studyRoom.ts` — mirror types từ `study-room.events.ts` backend (RoomState, TimerState, MediaState, RosterEntry, ChatMessage, role enum). Ghi comment trỏ về file backend làm nguồn sự thật.
3. `src/apis/studyRoomApi.ts` — create/mine/detail/update/delete/join(inviteCode)/leave/regenerateCode/leaderboard, qua shared axios instance.
4. `src/stores/useStudyRoomStore.ts` (zustand):
   - State: `myRooms` (cache TTL 5 phút theo pattern storeCache), `currentRoom`, `roster`, `timer`, `media`, `chat`, `myRole`, `connectionState`.
   - Actions REST: fetchMyRooms, createRoom, joinByCode, leaveRoom, updateRoom (invalidate cache sau mutation — đúng rule cache CLAUDE.md).
   - Actions socket-driven (được hook gọi): applySnapshot, applyTimerUpdate, applyMediaUpdate, applyPresence, appendChat, applyRoleUpdate, reset.
5. `src/hooks/useStudyRoomSocket.ts`:
   - Connect: `io(GATEWAY_URL, { path: '/ws/study', transports: ['websocket'], auth: { token: <access token từ localStorage — cùng nguồn api.ts> } })`.
   - On connect → emit `room:join {roomId}`; on `room:snapshot` → store.applySnapshot; map mọi server event → store action.
   - Reconnect: socket.io tự retry; on `reconnect` → re-emit `room:join` (snapshot khôi phục toàn bộ — không tin state cũ).
   - Heartbeat: `setInterval 30s` emit `presence:heartbeat {status}` — status suy từ timer state (pha work + running → 'studying', ngược lại 'break'); CHỈ gửi khi `document.visibilityState === 'visible'`.
   - Emit helpers trả về cho UI: startTimer, pauseTimer, resetTimer, updateConfig, setMedia, playMedia, pauseMedia, seekMedia, sendChat, grantRole, revokeRole, leave.
   - Cleanup đầy đủ trên unmount (socket.disconnect, clearInterval) — không leak.
6. Timer engine client `src/lib/pomodoro.ts` — hàm thuần `computeTimerView(timerState, config, now)` → `{phase, cycle, remainingMs, progress}`; logic nhảy pha work→break→…→longbreak. Thuần để unit-test được và tái dùng.

## Todo

- [x] socket.io-client + types mirror (types/studyRoom.ts)
- [x] studyRoomApi.ts (all endpoints)
- [x] useStudyRoomStore.ts (REST + socket actions, cache per rule)
- [x] useStudyRoomSocket.ts (auth, join, reconnect→snapshot, heartbeat visible-only, cleanup)
- [x] lib/pomodoro.ts deterministic + long-break logic

## Success Criteria

- `yarn build` + `yarn lint` pass; hook connect được tới gateway dev, nhận snapshot, store cập nhật (verify bằng console/devtools trước khi có UI).

## Risks

- Env URL: dùng cùng base URL FE đang dùng cho API (kiểm `api.ts` — `NEXT_PUBLIC_API_URL`); path `/ws/study` đi cùng host gateway.
- Token hết hạn giữa phiên WS: on `error {code:'UNAUTHORIZED'}` hoặc disconnect do auth → thử refresh qua flow api.ts rồi reconnect; quá 1 lần fail → đá về login (khớp hành vi 401 hiện có).
