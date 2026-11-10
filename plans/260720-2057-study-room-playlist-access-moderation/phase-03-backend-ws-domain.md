# Phase 03 — Backend WS: Playlist + Personal Block + Moderation

## Context Links
- Plan: [plan.md](plan.md) · Depends: phase-02
- File: `study-room.gateway.ts`, `study-room-state.service.ts`, `study-room.service.ts`, `study-room.repository.ts`, `study-room.events.ts`, `study-room.constants.ts`

## Overview
- **Priority:** High · **Status:** done
- Toàn bộ hành vi realtime mới: playlist + auto-advance (leader), chặn cá nhân, ban/mute.

## Playlist
- **DB** giữ items (repo: `addPlaylistItem`, `removePlaylistItem`, `reorderPlaylist`, `listPlaylist`). Order = Int, chuẩn hoá lại khi reorder.
- **Redis** giữ playback: key `studyroom:{id}:playlist` = `{currentIndex}` (playing/position tái dùng `media` cũ, đổi `media.url` = url của item hiện tại). TTL 24h.
- **Events (client→server):**
  - `playlist:add {url}` — kiểm `playlistAddPermission` (EVERYONE/COHOST+/HOST); validate YouTube (tái dùng `isValidYouTubeUrl`), suy `kind` (video vs playlist qua `list=`); append order cuối.
  - `playlist:remove {itemId}`, `playlist:reorder {itemIds[]}` — COHOST+.
  - `playlist:next|prev|jump {index}` — COHOST+; set currentIndex + reset media về url item mới, playing=true, position=0.
  - `media:ended {index}` — CHỈ nhận từ **leader** (server tự xác định leader, bỏ qua nếu socket không phải leader) + index khớp currentIndex → auto-advance (next, hoặc dừng nếu cuối / loop tuỳ config sau).
- **Leader election**: server chọn leader = host nếu online, else member online (presence) join lâu nhất. Lưu `studyroom:{id}:leader` (userId) hoặc suy tại chỗ từ roster. Khi leader disconnect → bầu lại; broadcast `playlist:updated` để FE biết ai là leader (FE chỉ leader mới gửi media:ended).
- **Server→client**: `playlist:updated {items, currentIndex, leaderUserId}`.
- Chuẩn hoá currentIndex sau remove/reorder: kẹp trong [0, len-1], nếu xoá item đang phát → phát item kế (hoặc dừng nếu rỗng).

## Personal chat block (server-persist, client-filter)
- Events: `chat:block {userId}` / `chat:unblock {userId}` → repo upsert/delete `StudyRoomChatBlock` (blocker = caller). Emit lại cho CHÍNH socket đó `blocks:updated {blockedUserIds}` (không broadcast).
- Snapshot bổ sung `myBlocks: string[]` (các blockedId của caller trong phòng).
- Chat vẫn broadcast cả phòng; FE ẩn tin có `userId ∈ myBlocks`.

## Moderation (HOST + COHOST, bền DB)
- Events: `member:ban {userId}` / `member:unban`, `member:mute {userId}` / `member:unmute`.
- Quyền: caller phải COHOST+; KHÔNG được ban/mute host hay cohost khác (chỉ tác động lên role thấp hơn mình; host bất khả xâm phạm). Kiểm server-side.
- Ban: set `StudyRoomMember.isBanned=true` → broadcast `member:moderated {userId, banned:true}` + đá socket của user đó khỏi phòng (`server.in(room).disconnectSockets` theo socket của userId, hoặc emit `room:kicked` rồi disconnect). Join lại bị chặn ở phase-02.
- Mute: set `isMuted=true` → broadcast `member:moderated {userId, muted:true}`; handler `chat:send` từ chối nếu caller muted (đọc cache member — nhớ invalidate memberCache khi mute/ban).
- Invalidate `findMemberCached` sau mọi thay đổi ban/mute/role.

## Snapshot bổ sung
`playlist {items, currentIndex, leaderUserId}`, `myBlocks[]`, roster mỗi entry thêm `isBanned/isMuted` (để UI hiển thị; banned thường không có mặt).

## Todo
- [ ] Repo: playlist CRUD + reorder + block upsert/delete + setBanned/setMuted (+ invalidate cache)
- [ ] State: currentIndex + leader trong Redis; chuẩn hoá index
- [ ] Gateway: playlist:add/remove/reorder/next/prev/jump + media:ended(leader) + auto-advance
- [ ] Gateway: chat:block/unblock + blocks:updated + snapshot myBlocks
- [ ] Gateway: member:ban/unban/mute/unmute + kick + chat:send chặn muted
- [ ] Leader election + bầu lại khi disconnect
- [ ] Snapshot mở rộng

## Success Criteria
- Script 2-3 client: add 2 video → leader hết video 1 tự next sang video 2 cho tất cả; member không đủ quyền add → FORBIDDEN; A chặn B → payload A có myBlocks chứa B; host ban B → B bị disconnect + join lại 403; mute C → chat:send của C bị từ chối.

## Security
- Mọi lệnh kiểm role/permission server-side (cached, invalidate đúng lúc). media:ended chỉ tin từ leader + index khớp (chống client giả mạo tua playlist). Không hạ được host.
