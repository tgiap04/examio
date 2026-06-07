## Context links

- Parent plan: [plan.md](../plan.md)
- Research: [researcher-02-frontend.md](../research/researcher-02-frontend.md)
- Locked design: [brainstorm session record](../../reports/brainstorm-260607-1517-admin-dashboard.md) (Q3: antd Table)
- Design system: [DESIGN.md](../../../../DESIGN.md)
- AppProviders (antd theme): [examio-fe/src/provider/AppProviders.tsx](../../../../examio-fe/src/provider/AppProviders.tsx)
- Stats example: [examio-fe/src/pages/k/ExamRoomSessionAnalyticsPage.tsx](../../../../examio-fe/src/pages/k/ExamRoomSessionAnalyticsPage.tsx) (Recharts usage)
- AdminRoute: [examio-fe/src/routes/guards/AdminRoute.tsx](../../../../examio-fe/src/routes/guards/AdminRoute.tsx) (new from phase 02)
- adminApi: [examio-fe/src/apis/adminApi.ts](../../../../examio-fe/src/apis/adminApi.ts) (new from phase 02)
- useAdminStore: [examio-fe/src/stores/useAdminStore.ts](../../../../examio-fe/src/stores/useAdminStore.ts) (new from phase 02)
- Phase 02: [phase-02-frontend-foundation.md](phase-02-frontend-foundation.md)
- Phase 05: [phase-05-backend-admin-stats.md](phase-05-backend-admin-stats.md)

## Overview

- **Date:** 2026-06-07
- **Track:** Frontend (F)
- **Priority:** P1
- **Implementation status:** pending
- **Review status:** pending

2 trang admin: Overview (4 KPI + 3 mini charts) + Stats (range selector 7d/30d/90d với 3 charts lớn). Áp dụng DESIGN.md tokens (cream surface, coral accent, dark navy cho KPI).

## Key Insights

- antd `ConfigProvider` đã themed với cream/coral/dark tokens ở phase 02. Tokens map trực tiếp: `colorPrimary` (coral), `colorBgLayout` (cream), `colorBgContainer` (cream-card), `colorTextHeading` (ink).
- Recharts đã dùng ở `ExamRoomSessionAnalyticsPage.tsx:14-26` — copy pattern.
- `useAdminStore` từ phase 02 có cache 5 phút — chỉ refetch khi stale hoặc explicit invalidate.
- 4 KPI cards đặt trên `bg-surface-dark` (`#181715`) để tạo contrast với cream page — DESIGN.md quy định.
- Range selector dùng antd `Segmented` control cho 7d/30d/90d.
- Vietnamese labels — dùng i18n key từ `vi/admin.json` (đã tạo phase 02).

## Requirements

**Functional**

`AdminOverviewPage`:
- 4 KPI cards trên dark navy surface:
  - "Tổng người dùng" → `overview.totalUsers`
  - "Người dùng mới hôm nay" → `overview.newUsersToday` (với delta so với hôm qua optional)
  - "Doanh thu tháng này" → `overview.monthlyRevenue` (format VND)
  - "Gói Pro/VIP" → `overview.proVipCount`
- 3 mini Recharts (line/bar/area) hiển thị 7 ngày gần nhất
- Loading skeleton khi `store.overview.loading`
- Error state với retry button

`AdminStatsPage`:
- Range selector: `Segmented<'7d' | '30d' | '90d'>`
- 3 charts (full-width):
  - Line chart: `userGrowth` — tăng trưởng người dùng
  - Bar chart: `traffic` — lưu lượng session
  - Area chart: `revenue` — doanh thu
- Trục X: dates
- Trục Y: count / VND
- Tooltip format tiếng Việt
- Loading + error state

**Non-functional**
- `yarn lint` pass
- Responsive: trên mobile (< 768px), KPI cards stack dọc, charts full-width
- Performance: render < 500ms với 90 data points
- Cache 5 phút qua `useAdminStore`; refetch khi user manual refresh hoặc after finance mutation

## Architecture

```
examio-fe/src/pages/admin/
  AdminOverviewPage.tsx           ← new
  AdminStatsPage.tsx              ← new
examio-fe/src/components/admin/
  KpiCard.tsx                     ← new
  RangeSelector.tsx               ← new
  MiniChartCard.tsx               ← new
examio-fe/src/locales/vi/
  admin.json                      ← extend with stats keys
```

`KpiCard` component:
```tsx
export function KpiCard({ label, value, format }: KpiCardProps) {
  return (
    <div className="bg-[#181715] text-[#faf9f5] rounded-xl p-6 border border-[#252320]">
      <div className="text-sm text-[#8e8b82] mb-2">{label}</div>
      <div className="text-3xl font-semibold tracking-tight">{format(value)}</div>
    </div>
  );
}
```

`MiniChartCard`:
```tsx
export function MiniChartCard({ title, data, type }: Props) {
  return (
    <Card title={title}>
      <ResponsiveContainer width="100%" height={120}>
        {type === 'line' ? (
          <LineChart data={data}>
            <Line dataKey="value" stroke="#cc785c" strokeWidth={2} dot={false} />
            <Tooltip />
          </LineChart>
        ) : type === 'bar' ? (
          <BarChart data={data}>
            <Bar dataKey="value" fill="#cc785c" />
          </BarChart>
        ) : (
          <AreaChart data={data}>
            <Area dataKey="value" fill="#cc785c" fillOpacity={0.3} stroke="#cc785c" />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </Card>
  );
}
```

## Related code files

**New:**
- `examio-fe/src/pages/admin/AdminOverviewPage.tsx`
- `examio-fe/src/pages/admin/AdminStatsPage.tsx`
- `examio-fe/src/components/admin/KpiCard.tsx`
- `examio-fe/src/components/admin/RangeSelector.tsx`
- `examio-fe/src/components/admin/MiniChartCard.tsx`
- `examio-fe/src/components/admin/StatChart.tsx` (large chart cho AdminStats)

**Modify:**
- `examio-fe/src/locales/vi/admin.json` — add stats keys (`admin.overview.*`, `admin.stats.*`, `admin.kpi.*`)

## Implementation Steps

1. **KpiCard** — antd `Card` styled với dark surface + cream text. Props: `label`, `value`, `format?` (mặc định `toLocaleString('vi-VN')`), `icon?` (optional), `delta?` (optional, so với kỳ trước).
2. **MiniChartCard** — wrapper cho Recharts nhỏ (height 120). Hỗ trợ line/bar/area.
3. **StatChart** — wrapper cho chart lớn (height 300). Hỗ trợ line/bar/area với full tooltip + legend.
4. **RangeSelector** — antd `Segmented` với options `[{ label: '7 ngày', value: '7d' }, ...]`. Emit `onChange` callback.
5. **admin.json locale** — thêm keys:
   ```json
   {
     "admin": {
       "overview": { "title": "Tổng quan", "subtitle": "Thống kê nhanh" },
       "kpi": { "totalUsers": "Tổng người dùng", "newToday": "Mới hôm nay", "monthlyRevenue": "Doanh thu tháng", "proVip": "Gói Pro/VIP" },
       "stats": { "title": "Thống kê chi tiết", "userGrowth": "Tăng trưởng người dùng", "traffic": "Lưu lượng truy cập", "revenue": "Doanh thu", "range": { "7d": "7 ngày", "30d": "30 ngày", "90d": "90 ngày" } }
     }
   }
   ```
6. **AdminOverviewPage**:
   - `useAdminStore().overview` — fetch on mount, cache 5 phút
   - Render 4 `KpiCard` grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`)
   - Render 3 `MiniChartCard` (line/bar/area) với 7 ngày data
   - Loading state: 4 skeleton cards
   - Error state: antd `Result` với retry button
7. **AdminStatsPage**:
   - `useState<'7d' | '30d' | '90d'>('7d')`
   - `useAdminStore().stats` — fetch on range change
   - Range selector on top
   - 3 full-width `StatChart` (userGrowth line, traffic bar, revenue area)
   - Loading + error state
8. **i18n** — dùng `useTranslation('admin')` để get strings.
9. **Format helpers** — VND currency format `Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })`.
10. **Responsive** — Tailwind breakpoints; test trên 375px (mobile) và 1440px (desktop).
11. **Lint + build** — `yarn lint && yarn build` ở frontend root.
12. **Manual test** — admin user → `/admin` → thấy 4 KPIs + 3 mini charts; click "Thống kê" trong sidebar → `/admin/stats` → chọn 30d → 3 charts update.

## Todo list

- [ ] Tạo `KpiCard.tsx` (dark surface + cream text)
- [ ] Tạo `MiniChartCard.tsx` (Recharts small)
- [ ] Tạo `StatChart.tsx` (Recharts large + tooltip)
- [ ] Tạo `RangeSelector.tsx` (antd Segmented)
- [ ] Extend `vi/admin.json` với stats keys
- [ ] Tạo `AdminOverviewPage.tsx` (4 KPI + 3 mini)
- [ ] Tạo `AdminStatsPage.tsx` (range + 3 large charts)
- [ ] Format helpers: VND currency, number locale
- [ ] Loading skeletons (antd `Skeleton`)
- [ ] Error state với retry
- [ ] Responsive test mobile + desktop
- [ ] `yarn lint` pass
- [ ] `yarn build` pass
- [ ] Manual: admin login → `/admin` → see KPIs + mini charts
- [ ] Manual: navigate `/admin/stats` → range 7d/30d/90d → charts update
- [ ] Manual: Vietnamese labels render đúng

## Success Criteria

- [ ] `/admin` hiện 4 KPI cards trên dark navy surface, value đúng từ API
- [ ] 3 mini charts render line/bar/area với 7 ngày data
- [ ] `/admin/stats` hiện range selector + 3 large charts
- [ ] Click 7d → 30d → 90d, charts refetch với data tương ứng
- [ ] VND format: `1.000.000 ₫` cho revenue
- [ ] Number format: `1.234` cho count
- [ ] Loading skeleton hiện trong khi fetch
- [ ] Error state với retry button khi API fail
- [ ] Responsive mobile (375px) — cards stack dọc, charts full-width
- [ ] Cache 5 phút — switch page back, không refetch
- [ ] Vietnamese labels từ i18n

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Recharts re-render nặng với data lớn | `useMemo` cho transform data, `ResponsiveContainer` với `debounce` 50ms |
| Date axis time zone | Format dùng `vi-VN` locale; backend trả ISO string, frontend convert to Date |
| Cache stale sau finance mutation | `useAdminStore.invalidateOverview()` + `invalidateSeries()` được gọi từ finance actions (phase 09) |
| Coral primary conflict với chart series | Dùng coral cho primary metric, secondary dùng ink hoặc muted-soft |
| Empty data (DB mới, chưa có payment) | Render empty state trong chart, không break |
| `Intl.NumberFormat` không support VND | Test trước; fallback hard-code format nếu cần |

## Security Considerations

- Stats endpoints là read-only, không leak PII (aggregate).
- Non-admin → AdminRoute redirect → không hit API.
- Không log full API response (có thể chứa internal aggregate count).

## Next steps

- Phase 09 (frontend users + finance + logs + audit) — chạy song song với phase này.
- Phase 10 (integration) — replace mock data với real API, test e2e.
