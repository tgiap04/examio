# Phase 01 — Prisma: User.utmSource + migration

**Priority:** High · **Status:** pending · **Depends on:** —

## Overview
Thêm một cột nullable lưu nguồn first-touch trên bảng `User`. Nền tảng cho mọi phase sau.

## Related Code Files
- Modify: `kmaedu-be/libs/database/src/schema.prisma` (hoặc file model chứa `model User` — xác nhận
  vị trí thực; scan trước đó chỉ ra `model User` ~dòng 404-435 trong schema dùng chung).
- Create: file migration Prisma dưới `kmaedu-be/libs/database/**/migrations/`.

## Implementation Steps
1. Thêm vào `model User`:
   ```prisma
   utmSource String? @db.VarChar(64)  // nguồn first-touch lúc đăng ký (utm_source); null = direct
   ```
   Cân nhắc `@@index([utmSource])` để `GROUP BY` nhanh khi bảng User lớn.
2. Sinh migration file **riêng cho thay đổi này**:
   `yarn prisma:migrate` (tạo migration) — KHÔNG dùng `db push --accept-data-loss`.
   Nếu `migrate` bị chặn bởi drift money float→int có sẵn: tạo migration thủ công chỉ chứa
   `ALTER TABLE "User" ADD COLUMN "utmSource" VARCHAR(64);` (+ index nếu thêm), rồi
   `yarn prisma:generate`. Ghi rõ trong PR là migration additive, an toàn.
3. `yarn prisma:generate` để cập nhật client types.

## Todo
- [ ] Thêm cột `utmSource String? @db.VarChar(64)` (+ index tùy chọn)
- [ ] Sinh migration file additive (không data-loss)
- [ ] `prisma:generate`, xác nhận `Prisma.UserCreateInput` có `utmSource`

## Success Criteria
- `User` có cột `utmSource` nullable; `prisma generate` xanh; migration file additive tồn tại;
  không đụng cột/model khác.

## Security / Notes
- `@db.VarChar(64)` chặn giá trị dài bất thường ở tầng DB (defense-in-depth cùng sanitize tầng app).
