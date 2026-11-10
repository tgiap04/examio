# Phase 04 — Frontend: Playlist / Access / Block / Moderation UI

## Context Links
- Plan: [plan.md](plan.md) · Depends: phase-03
- File: `kmaedu-fe/src/{types/studyRoom.ts, hooks/useStudyRoomSocket.ts, stores/useStudyRoomStore.ts, apis/studyRoomApi.ts}` + `pages/study-room/**`
- Design-system wrappers `@/components/antd/*`; style FE (nháy kép, 2 spaces)

## Overview
- **Priority:** High · **Status:** done
- Mirror contract mới vào FE + dựng UI cho 5 mảng.

## Implementation Steps
1. **types/studyRoom.ts**: thêm ClientEvents/ServerEvents mới (playlist:*, media:ended, chat:block/unblock, blocks:updated, member:ban/unban/mute/unmute, member:moderated, room:kicked); type `PlaylistItem`, `AccessType`, `PlaylistAddPermission`; mở rộng RoomSnapshot (`playlist`, `myBlocks`, roster+isBanned/isMuted), RosterEntry.
2. **useStudyRoomSocket**: emit helpers mới (addToPlaylist/removeItem/reorder/next/prev/jumpTo, blockUser/unblockUser, banUser/unbanUser/muteUser/unmuteUser); handlers: `playlist:updated`→store, `blocks:updated`→store, `member:moderated`→store, `room:kicked`→onClosed-style callback (toast + điều hướng ra). **Chỉ leader gửi `media:ended`**: player onEnded → nếu `myId === leaderUserId` mới emit.
3. **store**: state `playlist{items,currentIndex,leaderUserId}`, `myBlocks:string[]`; actions apply*. Chat selector lọc bỏ `msg.userId ∈ myBlocks`.
4. **youtube-sync-player**: phát theo `playlist.items[currentIndex]` (media.url đã là url item hiện tại). Item kind=playlist → `loadPlaylist`; kind=video → `loadVideoById`/`cueVideoById`. onEnded (chỉ leader) → emit media:ended. Giữ drift/echo/autoplay cũ.
5. **playlist-panel.tsx** (mới): danh sách item (now-playing highlight), thêm bằng ô nhập URL YouTube (ẩn nếu không đủ quyền theo `playlistAddPermission` + myRole), nút xoá/kéo-thả reorder (cohost+), next/prev (cohost+). Hiển thị ai là leader (nhỏ).
6. **roster-panel**: thêm menu per-user — "Chặn chat" (mọi người, gọi blockUser; đổi trạng thái theo myBlocks), và (HOST/COHOST) "Ban", "Cấm chat" / bỏ. Không hiện action moderation trên host/chính mình.
7. **room-settings-menu** (host): thêm chọn `accessType` (công khai/mã số/whitelist) + editor whitelist (nhập userId/email — tái dùng search nếu có) + `playlistAddPermission`. Lưu qua `updateStudyRoomApi`.
8. **chat-panel**: render dùng selector đã lọc myBlocks; input disabled nếu mình bị mute (server vẫn là chốt).
9. Responsive: playlist-panel nằm cạnh player (cột trái) hoặc tab. `yarn lint && yarn build` sau mỗi cụm.

## Todo
- [ ] types mirror contract mới
- [ ] socket hook: emit + handlers + leader-only media:ended
- [ ] store: playlist + myBlocks + chat filter selector
- [ ] youtube-sync-player theo playlist item (video/playlist kind)
- [ ] playlist-panel (add theo quyền, remove/reorder/next/prev)
- [ ] roster: block + ban/mute menu
- [ ] room-settings: accessType + whitelist + playlistAddPermission
- [ ] chat: lọc block + disable khi bị mute
- [ ] lint/build xanh

## Success Criteria
- 2 browser: host add 2 video → tự next khi hết; member không đủ quyền không thấy ô add; A chặn B → A không thấy chat B (reload vẫn vậy), người khác vẫn thấy; host ban B → B bị đá khỏi trang; mute C → C không gõ được chat.

## Risks
- Kéo-thả reorder trong lúc auto-advance chạy → dựa `playlist:updated` từ server làm nguồn sự thật, không giữ index local.
- Item là YT-playlist: chỉ đồng bộ mức "đang phát playlist X", không sync video con — hiển thị rõ cho người dùng.
