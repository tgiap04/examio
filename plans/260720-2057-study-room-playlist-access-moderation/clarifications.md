# Clarifications

## Session 2026-07-20

- Q: Playlist lưu ở đâu + chuyển bài thế nào? → A: Bền trong DB (bảng StudyRoomPlaylistItem) + auto-advance server; host/cohost next/prev tay
- Q: "Công khai" nghĩa là gì? → A: User đã đăng nhập (auth) là join được — KHÔNG cần mã/whitelist; KHÔNG có trang browse phòng công khai. 3 mode: 0 công khai-auth / 1 mã số / 2 whitelist (mirror ExamSession)
- Q: Chặn chat cá nhân lưu ở đâu? → A: Lưu server theo tài khoản (đồng bộ đa thiết bị). Room-scoped.
- Q: Ban/cấm chat: ai làm + bền không? → A: HOST + COHOST, bền trong DB (sống qua reconnect/restart)
- Q: Quyền thêm bài vào playlist? → A: Cấu hình được (playlistAddPermission: 0 mọi người / 1 cohost+ / 2 host)
- Q: Auto-advance kích hoạt thế nào (không có YouTube Data API)? → A: DUYỆT — "leader client" (host nếu online, không thì member online lâu nhất) bắn onEnded → media:ended → server tăng index. Fallback bầu lại leader + cohost next tay
- Q: Item playlist là YT-playlist thì xử lý sao? → A: DUYỆT — coi như 1 đơn vị, player chạy hết nội bộ rồi sang item kế; sync bên trong best-effort (bung từng video cần YouTube Data API — chưa làm)
- Q: Chặn cá nhân lọc ở đâu? → A: DUYỆT — list lưu server, LỌC ở client (tin vẫn broadcast, ẩn khi nhận theo myBlocks trong snapshot); "chặn thật không gửi" để sau

## Session 2026-07-21 (Post-Review Fixes & Follow-ups)

### Critical Fixes Applied
- H1: Leader re-election broadcast on member leave/disconnect; prevents playlist stall if leader drops.

### Medium Fixes Applied
- M1: Playlist item cap `MAX_PLAYLIST_ITEMS=100` enforced server-side.
- M2: `media:ended` throttled via `allowControl` guard (prevent client race).
- M3: `countMembers` excludes banned members (banned don't occupy room capacity).

### Low Fixes Applied
- L1: Remove item no longer triggers playback restart if item is BEFORE current index (only index shifts).

### Follow-ups (TODO)
- M4: Gateway-level auth tests (role-hierarchy, canAddPlaylist, onJoin-banned) — logic verified by code review; blocked by test harness availability.
- L2: Reorder duplicate-id artifact (visual; minor priority).
- L3: Whitelist validation — accept non-existent userIds (should validate at upsert; low priority UX).

### Pre-existing Issues (Unrelated)
- Admin-stats.service.spec.ts date-dependent failure (pre-existing; not part of this feature).

### Migration Strategy
- Dev DB: SQL applied directly via psql (isolated, additive); no migration file generated (project deploys via `db push`).
- Pre-existing blocker: money float→int migration blocks `db push --accept-data-loss=false`. Generate proper Prisma migration file before clean-slate deploy.
