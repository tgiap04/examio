## Context links

- Parent plan: [plan.md](../plan.md)
- Research: [researcher-01-backend.md](../research/researcher-01-backend.md)
- Prisma aggregations: [kmaedu-be/libs/database/src/schema.prisma](../../../../kmaedu-be/libs/database/src/schema.prisma)
- RedisService: [kmaedu-be/libs/redis/src/redis.service.ts](../../../../kmaedu-be/libs/redis/src/redis.service.ts)
- Phase 01: [phase-01-backend-infra-foundation.md](phase-01-backend-infra-foundation.md)

## Overview

- **Date:** 2026-06-07
- **Track:** Backend (B)
- **Priority:** P1
- **Implementation status:** done
- **Review status:** done

Module thống kê: 4 KPI + 3 series chart theo range (7d/30d/90d). Aggregations trên User / UserSession / Payment / WalletTransaction. Cache qua Redis 5 phút.

## Key Insights

- `User.createdAt` đã index → query date range nhanh.
- `UserSession.lastActivity` đã index `(userId, isActive)` — cho DAU/MAU.
- `Payment` đã index `(userId, paymentType, status)` — cho revenue.
- `WalletTransaction` đã có `createdAt`, `direction`, `amount`, `type` — cho revenue series.
- Cache key: `admin:stats:overview`, `admin:stats:series:7d`, `admin:stats:series:30d`, `admin:stats:series:90d`. TTL 300s. Invalidate khi finance mutation (publish event hoặc explicit `cache.del`).
- Tránh N+1: dùng `prisma.user.groupBy({ by: ['createdAt'], _count: true })` hoặc `$queryRaw` với `date_trunc`.

## Requirements

**Functional**

`GET /admin/overview`:
- `totalUsers`: `prisma.user.count()`
- `newUsersToday`: `prisma.user.count({ where: { createdAt: { gte: startOfToday } } })`
- `monthlyRevenue`: `prisma.payment.aggregate({ where: { status: 1, createdAt: { gte: startOfMonth } }, _sum: { amount: true } })`
- `proVipCount`: `prisma.userSubscription.count({ where: { tier: { in: [2, 3] }, isActive: true } })`
- Cache 5 phút, key `admin:stats:overview`.

`GET /admin/stats?range=7d|30d|90d`:
- `userGrowth`: array `{ date, count }` theo ngày (groupBy `date_trunc('day', createdAt)`)
- `traffic`: array `{ date, sessions }` theo ngày từ `UserSession.lastActivity`
- `revenue`: array `{ date, amount }` theo ngày từ `Payment` (`status: 1`) + `WalletTransaction` (type=1 buy subscription, direction=ADD)
- Cache 5 phút, key `admin:stats:series:{range}`.

**Non-functional**
- 1s cho 90d range với 100k users (cache hit ~50ms).
- Cache invalidation khi finance mutation (phase 06 sẽ gọi `cacheService.del`).
- Không làm aggregate lúc request (cache luôn).
- Tránh `SELECT *` — chỉ `select` fields cần.

## Architecture

```
admin-service/src/modules/admin-stats/
  admin-stats.service.ts
  admin-stats.controller.ts
  admin-stats.module.ts
  dto/
    range.query.ts                ← Zod enum 7d|30d|90d
  admin-stats.service.spec.ts
```

```ts
@Injectable()
export class AdminStatsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getOverview(): Promise<Overview> {
    const cacheKey = 'admin:stats:overview';
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const overview = {
      totalUsers: await this.prisma.user.count(),
      newUsersToday: await this.prisma.user.count({ where: { createdAt: { gte: startOfToday() } } }),
      monthlyRevenue: await this.prisma.payment.aggregate({
        where: { status: 1, createdAt: { gte: startOfMonth() } },
        _sum: { amount: true },
      }),
      proVipCount: await this.prisma.userSubscription.count({
        where: { tier: { in: [2, 3] }, isActive: true },
      }),
    };
    await this.redis.setex(cacheKey, 300, JSON.stringify(overview));
    return overview;
  }
}
```

## Related code files

**New:**
- `kmaedu-be/apps/admin-service/src/modules/admin-stats/admin-stats.service.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-stats/admin-stats.controller.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-stats/admin-stats.module.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-stats/dto/range.query.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-stats/admin-stats.service.spec.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-stats/admin-stats.types.ts`

**Modify:**
- `kmaedu-be/apps/admin-service/src/admin-service.module.ts` — import `AdminStatsModule`

## Implementation Steps

1. **Range enum** — `range.query.ts` Zod: `z.enum(['7d', '30d', '90d']).default('7d')`.
2. **Helper dates** — `admin-stats.types.ts` export `startOfToday()`, `startOfMonth()`, `startOfNDaysAgo(n)`, `dateRangeArray(n)` (fill missing dates với 0).
3. **getOverview()** — implement với Redis cache như trên.
4. **getSeries(range)** — implement 3 series:
   - User growth: `$queryRaw` `SELECT date_trunc('day', "createdAt") AS date, COUNT(*) FROM "User" WHERE "createdAt" >= $1 GROUP BY date ORDER BY date`.
   - Traffic: tương tự trên `UserSession.lastActivity`.
   - Revenue: tương tự trên `Payment` (`status = 1`) với `SUM(amount)`.
5. **Fill missing dates** — function `fillDateGaps(rows, range)` đảm bảo mỗi ngày trong range có 1 entry (count = 0 nếu không có).
6. **Controller** — 2 endpoints, `@UseGuards(AdminGuard)` + `@Throttle({ admin: { ttl: 60000, limit: 30 } })`.
7. **Cache invalidation** — expose method `invalidateOverview()` + `invalidateSeries()` public. Phase 06 (finance) sẽ gọi sau mỗi mutation.
8. **Unit tests** — mock Prisma + Redis. Test cases: cache miss → query; cache hit → skip query; range '7d' → 7 entries; missing dates filled with 0; cache invalidation clears key.
9. **Performance test** — seed 100k users, 1M UserSession, 50k Payment. Đo thời gian query + cache miss vs hit.

## Todo list

- [ ] Tạo `range.query.ts` Zod
- [ ] Tạo `admin-stats.types.ts` (helper dates + types)
- [ ] Implement `getOverview()` với Redis cache
- [ ] Implement `getSeries(range)` với 3 series
- [ ] Implement `fillDateGaps(rows, range)`
- [ ] Implement `invalidateOverview()` + `invalidateSeries()` public methods
- [ ] Tạo `admin-stats.controller.ts` với 2 endpoints
- [ ] Tạo `admin-stats.module.ts`
- [ ] Wire vào `admin-service.module.ts`
- [ ] Unit tests: cache miss/hit, range variants, date fill, invalidation
- [ ] Performance test: seed 100k users, assert < 1s cho 90d
- [ ] Verify `EXPLAIN ANALYZE` không có N+1
- [ ] `yarn build` pass
- [ ] `yarn dev:admin` boot OK
- [ ] Manual: `GET /admin/overview` returns 4 KPIs
- [ ] Manual: `GET /admin/stats?range=7d` returns 3 series × 7 entries

## Success Criteria

- [ ] `GET /admin/overview` trả `{ totalUsers, newUsersToday, monthlyRevenue, proVipCount }` đúng
- [ ] `GET /admin/stats?range=7d` trả `{ userGrowth[7], traffic[7], revenue[7] }` đầy đủ 7 ngày
- [ ] `GET /admin/stats?range=30d` → 30 entries
- [ ] `GET /admin/stats?range=90d` → 90 entries
- [ ] Cache miss: query + set Redis
- [ ] Cache hit: return cached, không query
- [ ] Cache invalidation: gọi `invalidateOverview()` → request tiếp theo query lại
- [ ] Empty DB → return 0 cho mọi field, không throw
- [ ] Non-admin JWT → 403
- [ ] Throttler 30 req/min

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `$queryRaw` injection | Parameterized queries với `$1, $2` — không concat string |
| Date range overlap giữa các series | Dùng chung `dateRangeArray()` helper |
| `date_trunc` timezone | Set `SET TIME ZONE 'UTC'` ở session, hoặc explicit trong query |
| Cache stale sau mutation | Phase 06 gọi `invalidateOverview()` + `invalidateSeries()` |
| `Payment.amount` currency | Hiện tại model không có currency breakdown — assume VND. Document |
| Revenue 2 lần (Payment + WalletTransaction) | Phase này chỉ query `Payment.status = 1` cho clarity. Phase 10 có thể merge |

## Security Considerations

- Stats không leak PII (chỉ aggregate). OK để cache.
- Throttler ngăn scraper.
- Không log raw query result (có thể chứa IP nếu join UserSession — nhưng phase này chỉ groupBy date, không lấy IP).

## Next steps

- Phase 06 (admin-finance) gọi `invalidateOverview()` + `invalidateSeries()` sau mỗi mutation.
- Phase 08 (frontend AdminOverview + AdminStats) consume các endpoints.

## Implementation Notes

- admin-stats module: overview (4 KPIs) + 3 series (userGrowth, traffic, revenue)
- Redis 5-minute cache via raw `ioredis` (not via `libs/redis` RedisService — avoids extra import)
- Cache keys: `admin:stats:overview`, `admin:stats:series:{range}`
- Public invalidation methods `invalidateOverview()` + `invalidateSeries()` for finance mutations to call
- Range query via Zod: `z.enum(['7d', '30d', '90d']).default('7d')`
- Date fill logic ensures every day in range has an entry (0 if no data)
- Throttler `'admin'` 30 req/min applied
