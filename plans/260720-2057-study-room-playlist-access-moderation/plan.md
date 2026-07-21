---
title: Study Room — Playlist, Access Modes & Moderation
status: pending
created: 2026-07-20
work_type: feature
spec_waived: "SDD mode disabled (takumi.sddMode: off)"
blockedBy: []
blocks: []
---

# Study Room Enhancements — Plan Overview

Mở rộng feature phòng học chung (đã ship ở `../260719-1844-study-together-room`) với 5 mảng:
1. **Playlist YouTube** — queue nhiều item (video hoặc YT-playlist), bền DB, auto-advance server qua "leader client".
2. **Chế độ vào phòng** — công khai (auth) / mã số / whitelist (mirror ExamSession `assessType`).
3. **Quyền thêm bài** — `playlistAddPermission` (mọi người / cohost+ / host).
4. **Chặn chat cá nhân** — list lưu server theo tài khoản (room-scoped), lọc ở client.
5. **Moderation** — HOST+COHOST ban (đá + cấm vào lại) / mute (cấm chat cả phòng), bền DB.

**Context:** `clarifications.md` · feature gốc `../260719-1844-study-together-room/`

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [Prisma: playlist/access/moderation/block models](phase-01-prisma-models.md) | pending | — |
| 2 | [Backend REST: access modes + settings](phase-02-backend-rest-access-settings.md) | pending | 1 |
| 3 | [Backend WS: playlist + block + moderation](phase-03-backend-ws-domain.md) | pending | 2 |
| 4 | [Frontend: playlist/access/block/moderation UI](phase-04-frontend-ui.md) | pending | 3 |
| 5 | [Tests + manual e2e](phase-05-tests.md) | pending | 3, 4 |

## Key Decisions (sealed)

- **Auto-advance = leader client**, KHÔNG server-timer (backend không có YouTube Data API → không biết thời lượng). Leader = host nếu online, else member online lâu nhất; bắn `media:ended` → server tăng `currentIndex`. Fallback bầu lại leader + cohost next tay.
- **YT-playlist item = 1 đơn vị**: player chạy hết nội bộ rồi sang item kế; sync bên trong best-effort.
- **Chặn cá nhân**: list persist server (đồng bộ đa thiết bị) nhưng LỌC client (tin vẫn broadcast, ẩn theo `myBlocks`). Không phá cơ chế room-broadcast của socket.io.
- **Access**: mọi route đã sau AuthGuard nên "công khai" = user đăng nhập join thẳng bằng roomId (tự tạo membership). Whitelist check userId. Mã số giữ luồng cũ.
- Playlist ITEMS + moderation/block state ở DB (bền); playback state (`currentIndex`, playing/position) vẫn ở Redis (live).

## Risks (watch)

1. Leader rớt/throttle giữa video → playlist đứng; cần bầu lại leader khi leader disconnect + luôn cho cohost next tay.
2. Reorder/remove item đang phát → phải chuẩn hoá `currentIndex` an toàn (không văng ra ngoài mảng).
3. Ban chính mình / ban host / cohost ban cohost khác — chặn ở server (không cho hạ host; cohost không ban được host/cohost).
4. Access đổi từ code→public khi đang có người: không đá ai; đổi public→whitelist: người ngoài whitelist đang trong phòng có bị đá? (quyết: KHÔNG đá real-time, chỉ chặn join mới — ghi rõ).
5. Block room-scoped: khi rời và vào phòng khác không mang theo block.

## Success Criteria

- Host thêm/xoá/kéo-thả playlist; hết video tự sang bài kế cho mọi client (<~1s trễ); cohost next/prev tay được; member thường bị chặn nếu `playlistAddPermission` không cho.
- Đổi accessType: public join không cần mã; whitelist chặn người ngoài; code giữ nguyên.
- Chặn A → chỉ mình không thấy chat của A; reload vẫn còn (server-persisted); người khác vẫn thấy A.
- Host/cohost ban B → B bị đá và không join lại được; mute C → C không gửi được chat (cả phòng), người khác không thấy tin mới của C.
- Build + lint + tests xanh cả FE/BE.
