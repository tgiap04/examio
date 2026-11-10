# Phase 07 — Frontend Study Room UI

## Context Links

- Plan: [plan.md](plan.md) · Depends: phase-06
- Routing: `kmaedu-fe/src/routes/index.tsx` + layouts trong `src/routes/layouts/`; guard `ProtectedRoute`
- Design system hiện có: components trong `src/components/ui` (không sửa — generated), match style file đang sửa (nháy kép, 2 spaces)

## Overview

- **Priority:** High · **Status:** ✓ done
- Trang danh sách phòng + trang phòng học (layout riêng, full-screen, không kế thừa layout học liệu hiện tại). Lazy-load cả route.
- All panels implemented: pomodoro, youtube-sync-player, roster, chat, leaderboard, settings. Routes registered; study-room page flag enabled in FE lib/page-keys.ts.

## Architecture — files to create

```
kmaedu-fe/src/pages/study-room/
├── StudyRoomListPage.tsx            # /study-rooms — phòng của tôi + nút tạo/join
├── StudyRoomPage.tsx                # /study-rooms/:id — compose các panel, gọi useStudyRoomSocket
└── components/
    ├── create-room-modal.tsx        # form name/desc/config Pomodoro/maxParticipants
    ├── join-by-code-modal.tsx       # nhập mã 6 số
    ├── pomodoro-panel.tsx           # đồng hồ đếm ngược + controls (host/cohost)
    ├── youtube-sync-player.tsx      # IFrame API wrapper đồng bộ
    ├── roster-panel.tsx             # avatar + online + studying/break + role badge
    ├── chat-panel.tsx               # list ảo hoá đơn giản + input (Enter gửi)
    ├── leaderboard-panel.tsx        # totalFocusSeconds desc
    └── room-settings-menu.tsx       # host: sửa config, regenerate code, đóng phòng, gán co-host
```

Route mới trong `src/routes/index.tsx` (lazy + ProtectedRoute + page-flag `study-room`), layout `StudyRoomLayout` tối giản.

## Key Component Specs

**pomodoro-panel** — `requestAnimationFrame`/interval 500ms gọi `computeTimerView` (lib phase 6); hiển thị pha (Học/Nghỉ/Nghỉ dài), cycle `x/y`, mm:ss; controls start/pause/reset/config CHỈ render khi `myRole >= COHOST` (server vẫn là chốt chặn). Đổi pha → notify nhẹ (title tab + âm ting tuỳ chọn).

**youtube-sync-player** — nạp IFrame API bằng script tag (singleton loader, không dep mới):
- Nhận `media` từ store. Điều phối: `loadVideoById`/`cueVideoById` khi url đổi; play/pause theo `media.playing`.
- **Chống drift:** interval 5s so `player.getCurrentTime()` với `positionSec + (now − updatedAt)/1000`; lệch >2s → `seekTo(expected)`.
- **Chống vòng lặp echo:** phân biệt sự kiện do user thao tác trên player (host/cohost mới được emit `media:*`) với thay đổi do sync gây ra — dùng flag `isSyncing` khi apply remote state, bỏ qua `onStateChange` phát sinh trong lúc đó. MEMBER: player KHÔNG điều khiển được (che overlay controls hoặc `playerVars: {controls: 0, disablekb: 1}`) — chỉ chỉnh volume local.
- Autoplay policy trình duyệt: video có tiếng không tự play trước user-gesture → overlay "Bấm để tham gia phát chung" một lần khi vào phòng, sau gesture mới sync play.

**chat-panel** — render text thuần (không dangerouslySetInnerHTML), auto-scroll đáy khi ở đáy, max 500 ký tự, hiển thị tên + giờ.

**roster-panel** — online từ presence, badge 📖 studying / ☕ break; context menu (chỉ HOST) gán/gỡ co-host.

## Implementation Steps

1. Routes + layout + page flag.
2. List page + create/join modals (REST store actions).
3. Room page compose + connect socket on mount, disconnect on unmount.
4. Pomodoro panel → YouTube player → roster → chat → leaderboard → settings menu (thứ tự dựng).
5. Responsive: desktop 3 cột (player+timer | roster | chat), mobile stack dọc, player sticky top.
6. `yarn lint && yarn build` sau mỗi cụm component.

## Todo

- [x] Routes/layout/flag + list page + modals (create/join)
- [x] Room page + socket lifecycle
- [x] pomodoro-panel (client-side countdown)
- [x] youtube-sync-player (drift, echo, autoplay, quyền)
- [x] roster + chat + leaderboard + settings
- [x] Responsive + lint/build xanh

## Success Criteria

- Mở 2 trình duyệt cùng phòng: điều khiển từ host phản ánh <1s ở client kia; member không thấy/không dùng được controls; reload giữa chừng khôi phục đúng pha timer + vị trí video.

## Risks

- YouTube IFrame API load chậm/bị chặn → skeleton + retry, không crash panel khác.
- Memo hoá panel (React.memo) để chat message dồn dập không re-render player gây giật.
