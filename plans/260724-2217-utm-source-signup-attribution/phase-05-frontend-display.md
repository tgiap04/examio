# Phase 05 — Frontend: hiển thị nguồn ở /admin/stats + /admin

**Priority:** Medium · **Status:** pending · **Depends on:** 3

## Overview
Hiện breakdown "đăng ký theo nguồn" ở `/admin/stats` (đầy đủ) và card "Top nguồn" ở `/admin`.

## Related Code Files
- Modify: `examio-fe/src/apis/adminApi.ts` — `getSourcesApi(range?)` → `GET /admin/sources?range=`
  (mẫu `getSeriesApi`); type `SourceBreakdown = { source: string; count: number }[]`.
- Modify: `examio-fe/src/stores/useAdminStore.ts` — thêm `sources: ResourceState<SourceBreakdown>`
  + `fetchSources(range, force?)` + `invalidateSources()` (mẫu ResourceState + 5' freshness).
- Create: `examio-fe/src/components/admin/SourceBreakdownChart.tsx` — chart PHÂN LOẠI (bar ngang
  hoặc pie) nhận `{source,count}[]`. KHÔNG dùng `StatChart` (nó date-keyed). Tái dùng Recharts +
  CSS-var theming (`--coral`, `--hairline`, `--muted-text`) + loading/empty/error như StatChart.
- Modify: `examio-fe/src/pages/admin/AdminStatsPage.tsx` — thêm mục "Nguồn đăng ký" + RangeSelector.
- Modify: `examio-fe/src/pages/admin/AdminOverviewPage.tsx` — card "Top nguồn" (top 3-5) trong lưới
  MiniChart; có thể dùng danh sách gọn hoặc mini bar.

## Implementation Steps
1. `adminApi.getSourcesApi(range?)` trả `SourceBreakdown`.
2. Store slice `sources` theo đúng envelope + `isFresh` gate; selector trả tham chiếu ổn định
   (theo lưu ý `EMPTY_SERIES` trong AdminStatsPage) — thêm hằng `EMPTY_SOURCES`.
3. `SourceBreakdownChart`: bar ngang (source theo trục Y, count trục X) là dễ đọc nhất khi có nhiều
   nguồn; nhãn 'direct' cho null. Có skeleton/empty/error.
4. `/admin/stats`: mục mới dưới 3 chart hiện có; RangeSelector tái dùng (nếu route hỗ trợ range).
5. `/admin`: card "Top nguồn" gọn — top 5 theo count, phần còn lại gộp "khác".

## Todo
- [ ] `getSourcesApi` + type `SourceBreakdown`
- [ ] Store `sources` ResourceState + fetch/invalidate + EMPTY_SOURCES
- [ ] `SourceBreakdownChart` (categorical, Recharts, theming + states)
- [ ] Mục "Nguồn đăng ký" ở AdminStatsPage (+ RangeSelector)
- [ ] Card "Top nguồn" ở AdminOverviewPage

## Success Criteria
- `/admin/stats` render chart nguồn (unikorn, direct, ...) đúng số; đổi range refetch; `/admin`
  hiện top nguồn; loading/empty states ổn; không phá memo/re-render (selector ổn định).

## Notes
- 'direct' là nhãn cho null (đồng bộ với COALESCE ở Phase 3).
