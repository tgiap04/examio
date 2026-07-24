---
title: UTM Source Signup Attribution
status: implemented
created: 2026-07-24
completed: 2026-07-24
work_type: feature
spec_waived: "SDD mode disabled (takumi.sddMode: off)"
blockedBy: []
blocks: []
---

# UTM Source Signup Attribution — Plan Overview

Thêm thống kê "click đến từ đâu" vào `/admin/stats` và `/admin`, dựa trên `utm_source`
(vd `?utm_source=unikorn`). Hướng đã chốt ở consultation: **quy kết ĐĂNG KÝ** (không đếm
visit ẩn danh), **chỉ `utm_source`**, **first-touch**.

Luồng: vào có `utm_source` → nhớ first-touch (localStorage) → sống sót qua điều hướng/OAuth
→ gắn vào `User` khi đăng ký → admin tổng hợp `GROUP BY utm_source`.

**Context:** consultation vừa chốt · scan codebase (admin-service admin-stats, auth-service
register/OAuth, FE AdminStatsPage/useAdminStore/adminApi, AppProviders/useAuthSync).

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [Prisma: User.utmSource + migration](phase-01-prisma-utm-column.md) | done | — |
| 2 | [Backend: capture utm_source khi đăng ký (email + OAuth)](phase-02-backend-auth-capture.md) | done | 1 |
| 3 | [Backend: admin-stats source breakdown](phase-03-backend-admin-stats.md) | done | 1 |
| 4 | [Frontend: bắt & giữ utm_source (first-touch)](phase-04-frontend-capture.md) | done | 2 |
| 5 | [Frontend: hiển thị nguồn ở /admin/stats + /admin](phase-05-frontend-display.md) | done | 3 |
| 6 | [Tests + verify](phase-06-tests.md) | done | 2,3,4,5 |

## Post-implementation notes

- Wired all 3 signup entry points: email register, Google OAuth redirect (via `state`), Google One Tap.
- Review fixes applied: One-Tap now sends utm_source; consume-once clear on OAuth + One-Tap success; literal `"direct"` blocklisted at both sanitize layers.
- **Not done (manual):** apply migration SQL to DB (repo `db push` blocked by money float→int drift); verify Google live sign-in with `?utm_source=…` (no creds in session).
- Reviewer minors deferred (pre-existing / low): user row created before nonce check in OAuth (pre-existing ordering); `utmSource` returned in auth response bodies (low sensitivity, user's own data).

Phase 2 và 3 chạy song song được sau khi 1 xong. Phase 4 (lib bắt UTM) độc lập, nhưng phần
wiring register/OAuth trong 4 cần DTO + luồng OAuth từ 2. Phase 5 cần route từ 3.

## Key Decisions (sealed)

- **Chỉ `utm_source`** (một cột `User.utmSource String?`), không lưu medium/campaign/term/content.
- **First-touch**: chỉ ghi localStorage nếu CHƯA có giá trị; không ghi đè lần vào sau.
- **Không đếm visit ẩn danh** → không có endpoint public, không bảng mới, không bề mặt bot.
- **Reuse admin-stats hiện có**: raw SQL + Redis cache 5', AdminGuard, gateway catch-all (không sửa gateway).
- **`null` → nhóm "direct"** trong tổng hợp (`COALESCE`).

## Risks (watch)

1. **OAuth state plumbing** — localStorage KHÔNG tới backend lúc callback; phải nối `utm_source`
   qua `state` param của URL khởi tạo Google OAuth và đọc lại ở callback. Cần đọc đúng google
   strategy/guard hiện tại (passport-google-oauth20?) — điểm phức tạp nhất.
2. **Migration file** — cột additive nullable, nhưng repo vướng `db push` (money float→int). Sinh
   migration file riêng, KHÔNG chạy `--accept-data-loss`.
3. **Sanitize `utm_source`** — cap độ dài (vd 64) + whitelist charset (a-z0-9_-.) cả FE lẫn BE (zod)
   để tránh rác/injection vào cột.
4. **StatChart date-keyed** — không tái dùng được cho dữ liệu phân loại; cần component mới
   `SourceBreakdownChart` (bar hoặc pie theo nguồn).
5. **User cũ** — `utmSource` null → gộp "direct/organic", không backfill.

## Success Criteria

- Vào `?utm_source=unikorn` rồi đăng ký (email VÀ Google) → `User.utmSource='unikorn'`.
- Vào không có utm rồi đăng ký → `utmSource` null → hiện trong nhóm "direct".
- `/admin/stats` hiện breakdown nguồn (có RangeSelector); `/admin` hiện card "Top nguồn".
- Build + lint + test FE/BE xanh.
