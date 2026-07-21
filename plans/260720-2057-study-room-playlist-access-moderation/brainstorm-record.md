# Brainstorm Record — Study Room: Playlist, Access & Moderation

> 2026-07-20 · CTO lens · Mở rộng feature `../260719-1844-study-together-room`

## Commission
Thêm cho phòng học chung (`/k/study-room/:id`): (1) playlist YouTube nhiều item, (2) chế độ vào phòng công khai/whitelist/mã số như phiên thi, (3) cấu hình quyền thêm bài, (4) chặn chat cá nhân (chỉ ẩn với người chặn), (5) host/cohost ban & cấm chat (cả phòng).

## Quyết định đã seal
| Vấn đề | Chốt |
|---|---|
| Playlist | Bền DB (bảng StudyRoomPlaylistItem) + auto-advance server |
| Auto-advance trigger | **Leader client** báo `media:ended` (không có YouTube Data API để server đếm giờ); fallback bầu lại leader + cohost next tay |
| YT-playlist item | Coi như 1 đơn vị, player chạy nội bộ; sync bên trong best-effort |
| Access | công khai=user auth join thẳng / mã số / whitelist; KHÔNG browse public |
| Quyền thêm bài | `playlistAddPermission` (mọi người / cohost+ / host) |
| Chặn cá nhân | List lưu server (đồng bộ đa thiết bị), room-scoped; LỌC ở client |
| Ban/mute | HOST + COHOST, bền DB; không hạ được host/cohost khác |

## Rủi ro chính
Leader rớt giữa video; chuẩn hoá currentIndex khi remove/reorder; đổi access không đá người đang trong phòng (chỉ chặn join mới); block room-scoped.

## Tiếp theo
Plan đã lập: `plan.md` (5 phase) + tasks #9–#13. Chạy: `/tkm:takumi plans/260720-2057-study-room-playlist-access-moderation`.
