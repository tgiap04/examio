# Phase 02 — Backend: capture utm_source khi đăng ký (email + OAuth)

**Priority:** High · **Status:** pending · **Depends on:** 1

## Overview
Ghi `utmSource` vào `User` ở CẢ hai nhánh tạo user: email register và OAuth (Google).
Đây là phase chứa rủi ro #1 (OAuth state plumbing).

## Related Code Files
- Modify: `kmaedu-be/apps/auth-service/src/dto/register.dto.ts` — thêm field zod optional.
- Modify: `kmaedu-be/apps/auth-service/src/auth.service.ts` — nhánh email register (~146-205) và
  nhánh OAuth create (~583-616): ghi `utmSource` vào `tx.user.create({ data: { ..., utmSource } })`.
- Read/confirm: google strategy + guard (`libs/common/src/guard/google-auth.guard.ts` và google
  strategy tương ứng) để biết cách `state` param được truyền/đọc.

## Key Insight
- localStorage KHÔNG có ở backend lúc OAuth callback → email register truyền utm qua body dễ;
  OAuth phải truyền qua `state` param khi FE khởi tạo redirect, backend đọc lại ở callback.

## Implementation Steps
1. **RegisterDto**: thêm
   ```ts
   utmSource: z.string().trim().max(64).regex(/^[\w.-]+$/).optional()
   ```
   (regex whitelist charset; optional). Chuẩn hoá "" → undefined.
2. **Email register** (auth.service.ts ~146-205): nhận `dto.utmSource`, sanitize lần cuối
   (lowercase? giữ nguyên — quyết định: giữ nguyên nhưng đã whitelist), set vào `user.create`.
3. **OAuth**:
   a. Xác định điểm khởi tạo Google OAuth (endpoint redirect). Cho phép nhận `utm_source` (query)
      và forward vào passport `state` (passport-google-oauth20 hỗ trợ `state`).
   b. Ở callback, đọc `req.query.state` (hoặc cơ chế state của strategy), parse ra `utm_source`,
      sanitize (max 64, whitelist), set vào nhánh OAuth create (~583-616) CHỈ khi user mới
      (first-touch: không ghi đè nếu user đã tồn tại).
   c. Nếu strategy hiện tại không dễ truyền `state`, fallback: nhận utm qua query param của
      redirect init và lưu tạm (vd Redis keyed theo state/nonce) — ghi rõ lựa chọn trong PR.
4. `utmSource` chỉ set khi TẠO user mới; không đụng khi user đã tồn tại (đăng nhập lại).

## Todo
- [ ] RegisterDto thêm `utmSource` zod optional + whitelist charset
- [ ] Email register ghi utmSource vào user.create
- [ ] Đọc google strategy → chốt cơ chế truyền state
- [ ] OAuth: forward utm_source qua state, đọc ở callback, ghi khi tạo user mới
- [ ] Đảm bảo không ghi đè utmSource cho user đã tồn tại

## Success Criteria
- POST register với `utmSource: "unikorn"` → User.utmSource='unikorn'.
- Đăng ký Google từ URL mang `utm_source=unikorn` → User.utmSource='unikorn'.
- Không có utm → null. Đăng nhập lại (user cũ) → không thay đổi utmSource.

## Security
- Sanitize + cap độ dài ở zod (tầng app) chồng lên `@db.VarChar(64)` (tầng DB).
- `state` param phải được validate (không tin mù) — chỉ rút `utm_source`, bỏ phần còn lại.
