# Phase 02 — Backend REST: Access Modes + Room Settings

## Context Links
- Plan: [plan.md](plan.md) · Depends: phase-01
- File: `kmaedu-be/apps/exam-service/src/modules/study-room/{study-room.service.ts, .repository.ts, .controller.ts, dto/study-room.dto.ts, study-room.constants.ts}`
- Gateway proxy: `apps/gateway-service/src/controllers/study-room-proxy.controller.ts`

## Overview
- **Priority:** High · **Status:** done
- Rework luồng join theo `accessType`; cho host cấu hình access + whitelist + playlistAddPermission.

## Implementation Steps
1. **Constants**: enum `AccessType {PUBLIC=0, CODE=1, WHITELIST=2}`, `PlaylistAddPermission {EVERYONE=0, COHOST=1, HOST=2}`.
2. **DTO** (`nestjs-zod`): mở rộng `UpdateStudyRoomDto` — `accessType 0..2`, `whitelist string[]` (userId), `playlistAddPermission 0..2`. Thêm `JoinRoomDto { inviteCode?: string }` (code optional — chỉ cần khi CODE).
3. **Service.joinByCode → joinRoom(user, roomId?, inviteCode?)** thống nhất:
   - CODE: giữ luồng cũ (tìm theo inviteCode, verify).
   - PUBLIC: join bằng roomId, user đã auth → tạo membership MEMBER (idempotent).
   - WHITELIST: join bằng roomId, chỉ khi `user.id ∈ whitelist` (hoặc đã là member/host) → tạo membership; else 403.
   - MỌI mode: chặn nếu `member.isBanned` (403 "Bạn đã bị cấm khỏi phòng"); chặn phòng đầy / isActive=false như cũ.
   - Đổi access KHÔNG đá người đang trong phòng (chỉ glate join mới) — ghi rõ.
4. **Controller**: giữ `POST /studyrooms/join` (by code) + thêm `POST /studyrooms/:id/join` (by id cho public/whitelist). `PUT /studyrooms/:id` nhận thêm 3 field mới (host-only, invalidate room cache).
5. **Gateway proxy**: mirror route `:id/join` mới.
6. Whitelist picker tái dùng pattern `users/search` của examsession nếu FE cần (optional, có thể để FE nhập userId/email sau).

## Todo
- [ ] Constants AccessType + PlaylistAddPermission
- [ ] DTO update + JoinRoomDto
- [ ] joinRoom theo 3 mode + chặn banned
- [ ] Controller :id/join + PUT settings mới
- [ ] Gateway proxy route mới
- [ ] Build + smoke

## Success Criteria
- PUBLIC: user auth POST :id/join → thành member (không cần mã). WHITELIST: ngoài list → 403. CODE: như cũ. Banned → 403 mọi mode.

## Security
- Mọi route sau AuthGuard; đổi settings chỉ HOST; không lộ inviteCode/whitelist cho MEMBER (chỉ COHOST+). Kiểm banned server-side, không tin client.
