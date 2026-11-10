# Phase 03 — Backend: admin-stats source breakdown

**Priority:** High · **Status:** pending · **Depends on:** 1

## Overview
Thêm tổng hợp "đăng ký theo nguồn" vào admin-stats, tái dùng khung raw-SQL + Redis cache + AdminGuard
sẵn có. Song song được với Phase 2.

## Related Code Files
- Modify: `kmaedu-be/apps/admin-service/src/modules/admin-stats/admin-stats.service.ts` — thêm
  `getSourceBreakdown(range?)` + cache key + invalidate.
- Modify: `admin-stats.controller.ts` — route `GET /admin/stats/sources?range=`.
- Modify: `admin-stats-fe-routes.controller.ts` — alias `GET /admin/sources?range=`.
- KHÔNG sửa gateway (admin-proxy catch-all `/admin/*` đã proxy).

## Implementation Steps
1. `getSourceBreakdown(range?: '7d'|'30d'|'90d')` → raw SQL:
   ```sql
   SELECT COALESCE(NULLIF("utmSource", ''), 'direct') AS source, COUNT(*)::int AS count
   FROM "User"
   [WHERE "createdAt" >= $since]
   GROUP BY 1 ORDER BY count DESC LIMIT 20;
   ```
   Trả `{ source, count }[]`. `range` optional (mặc định: toàn thời gian, hoặc chọn 30d — chốt khi
   code, khớp UX RangeSelector).
2. Cache Redis theo mẫu hiện có: key `admin:stats:sources:{range|all}`, TTL 5' (dùng cùng hằng số
   `admin-stats.service.ts:17-18`). Không cần invalidate riêng — TTL 5' đủ (nhất quán với series).
3. Controller: `GET /admin/stats/sources` (`@UseGuards(AdminGuard)`, `@Throttle` như các route khác),
   query `range` optional. Alias FE `GET /admin/sources` delegate cùng service.

## Todo
- [ ] `getSourceBreakdown(range?)` raw SQL + COALESCE 'direct' + LIMIT 20
- [ ] Redis cache key `admin:stats:sources:{range}` TTL 5'
- [ ] Route canonical `/admin/stats/sources` + alias `/admin/sources`, AdminGuard + Throttle
- [ ] Xác nhận gateway catch-all proxy tới (không sửa code gateway)

## Success Criteria
- `GET /admin/sources` (admin token) → `[{source:'unikorn',count:N}, {source:'direct',count:M}, ...]`
  giảm dần theo count; non-admin bị chặn; cache hit lần 2.

## Performance
- Một query GROUP BY có index trên `utmSource` (Phase 1) → O(index scan). LIMIT 20 chặn payload.
