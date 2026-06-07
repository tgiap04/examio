## Context links

- Parent plan: [plan.md](../plan.md)
- Locked design: [brainstorm session record](../../reports/brainstorm-260607-1517-admin-dashboard.md)
- Research: [researcher-02-frontend.md](../research/researcher-02-frontend.md)
- Routes: [examio-fe/src/routes/index.tsx](../../../../examio-fe/src/routes/index.tsx)
- Existing guard: [examio-fe/src/routes/guards/TeacherRoute.tsx](../../../../examio-fe/src/routes/guards/TeacherRoute.tsx)
- Auth store: [examio-fe/src/stores/useAuthStore.ts](../../../../examio-fe/src/stores/useAuthStore.ts)
- User type: [examio-fe/src/types/user.ts](../../../../examio-fe/src/types/user.ts)
- API example: [examio-fe/src/apis/subscriptionApi.ts](../../../../examio-fe/src/apis/subscriptionApi.ts)
- Store example: [examio-fe/src/stores/useStatsStore.ts](../../../../examio-fe/src/stores/useStatsStore.ts)
- Design system: [DESIGN.md](../../../../DESIGN.md)
- AppProviders: [examio-fe/src/provider/AppProviders.tsx](../../../../examio-fe/src/provider/AppProviders.tsx)

## Overview

- **Date:** 2026-06-07
- **Track:** Frontend (F)
- **Priority:** P0 (foundation — unblocks all admin pages)
- **Implementation status:** done
- **Review status:** done

Foundation cho 6 trang admin: `AdminRoute` guard, `adminApi.ts` typed surface, `useAdminStore`, `AdminLayout` shell, route wiring, antd theme token mapping, locale `vi/admin.json`.

## Key Insights

- `useAuthStore.user.isAdmin` đã có ở `src/types/user.ts:14` — `AdminRoute` chỉ check field này.
- `subscriptionApi.ts:1-167` pattern: axios `api` instance + typed function, dùng chung 401-refresh + device header từ `api.ts:45`.
- `useStatsStore.ts:37-109` cache-or-skip pattern với per-slice loading + `invalidate*` helpers — replicate.
- antd `ConfigProvider` đã themed với cream/coral/dark tokens ở `AppProviders.tsx:11-46` — design tokens map trực tiếp.
- Chưa có `EventSource` usage trong repo — greenfield, cần design SSE auth trước.
- Recharts đã dùng ở `ExamRoomSessionAnalyticsPage.tsx:14-26`.

## Requirements

**Functional**
- `AdminRoute` guard: check `useAuthStore.user.isAdmin === true`. Redirect non-admin → `/k`. Giữ loading state giống `TeacherRoute`.
- `src/apis/adminApi.ts`: typed functions cho overview, users, stats, finance actions, log tail (SSE), audit
- `src/stores/useAdminStore.ts`: Zustand slices `overview | users | userDetail | stats | financeActions | audit` + per-slice `loading` + `invalidate*`
- `src/pages/admin/AdminLayout.tsx`: sidebar (6 menu items) + topbar (admin badge + logout)
- 6 routes: `/admin`, `/admin/users`, `/admin/stats`, `/admin/finance`, `/admin/logs`, `/admin/audit` (tất cả wrap bởi `AdminRoute` + `AdminLayout`)
- `src/locales/vi/admin.json` namespace mới (recommendation Q6)
- Mapping antd theme tokens với DESIGN.md (cream `#faf9f5`, coral `#cc785c`, dark `#181715`, hairline `#e6dfd8`, ink `#141413`)

**Non-functional**
- `yarn lint` pass
- `yarn build` pass
- Không thêm route blocker cho `/k/*` (admin cũng dùng được trang user)

## Architecture

```
examio-fe/src/
  routes/
    guards/AdminRoute.tsx        ← new
    index.tsx                    ← +6 admin routes
  pages/admin/
    AdminLayout.tsx              ← new
  apis/
    adminApi.ts                  ← new (typed surface)
  stores/
    useAdminStore.ts             ← new (Zustand)
  locales/vi/
    admin.json                   ← new (Vietnamese strings)
  components/admin/              ← populated in phase 08/09
```

`AdminRoute` không cản truy cập `/k/*` — chỉ guard riêng `/admin/*`. Admin user vẫn thấy link "Trang quản trị" trong KLayout (gated `user.isAdmin`).

## Related code files

**New:**
- `examio-fe/src/routes/guards/AdminRoute.tsx`
- `examio-fe/src/pages/admin/AdminLayout.tsx`
- `examio-fe/src/apis/adminApi.ts`
- `examio-fe/src/stores/useAdminStore.ts`
- `examio-fe/src/locales/vi/admin.json`
- `examio-fe/src/pages/admin/AdminOverviewPage.tsx` (skeleton — list các tab trong layout, hiện "Coming soon" cho phase 08)

**Modify:**
- `examio-fe/src/routes/index.tsx` — thêm 6 admin routes với `AdminRoute` + `AdminLayout` wrap
- `examio-fe/src/provider/AppProviders.tsx` — confirm antd theme tokens aligned với DESIGN.md (no change nếu đã align)
- `examio-fe/src/components/kokonutui/KLayout.tsx` (hoặc sidebar tương đương) — thêm "Trang quản trị" link gated `user.isAdmin` (move sang phase 10 nếu conflict)

## Implementation Steps

1. **AdminRoute guard** — copy `TeacherRoute.tsx`, thêm check `user.isAdmin`. Redirect → `/k` nếu `!isAdmin`. Giữ `initializing` state.
2. **adminApi.ts** — define types `Overview`, `UserRow`, `UserDetail`, `StatsResponse`, `FinanceActionRequest`, `AuditRow`. Export functions: `getOverviewApi`, `listUsersApi`, `getUserDetailApi`, `updateUserApi`, `banUserApi`, `getSystemStatsApi`, `listFinanceActionsApi`, `refundApi`, `creditApi`, `setTierApi`, `listAuditApi`. `tailLogsApi` return `EventSource` (caller manage lifecycle).
3. **useAdminStore** — Zustand store với slice per resource. Per-slice state: `{ data, loading, error, lastFetched }`. Helpers: `invalidateOverview()`, `invalidateUsers()`, ... Bỏ cache 5 phút (skip refetch nếu còn fresh).
4. **AdminLayout** — antd `Layout` + `Sider` (sidebar) + `Header` (topbar) + `Content` outlet. Sidebar items: Tổng quan, Người dùng, Thống kê, Tài chính, Logs, Audit. Highlight active route.
5. **Routes wiring** — thêm 6 route vào `routes/index.tsx`, mỗi route wrap `<AdminRoute><AdminLayout><Page/></AdminLayout></AdminRoute>`.
6. **Locale** — tạo `vi/admin.json` với tất cả string tiếng Việt. Trong phase này chỉ cần menu items + page titles.
7. **Theme verify** — mở `AppProviders.tsx` xem token `colorPrimary`, `colorBgLayout`, `borderRadius`. Nếu không align DESIGN.md, update trong phase này (cream surface, coral primary, dark surface cho KPI card).
8. **Lint + build** — `yarn lint && yarn build` ở frontend root.

## Todo list

- [ ] Create `AdminRoute.tsx` (model TeacherRoute)
- [ ] Create `adminApi.ts` với typed surface (functions + types)
- [ ] Create `useAdminStore.ts` (Zustand slices + cache)
- [ ] Create `AdminLayout.tsx` (sidebar + topbar + outlet)
- [ ] Create `vi/admin.json` namespace
- [ ] Thêm 6 routes vào `routes/index.tsx`
- [ ] Verify antd theme tokens align DESIGN.md
- [ ] Tạo `AdminOverviewPage.tsx` skeleton (page title only)
- [ ] `yarn lint` pass
- [ ] `yarn build` pass
- [ ] Manual test: navigate `/admin` as non-admin → redirect `/k`
- [ ] Manual test: navigate `/admin` as admin → see sidebar

## Success Criteria

- [ ] `yarn lint && yarn build` pass
- [ ] Non-admin visit `/admin` → redirect `/k` (kiểm tra qua dev server)
- [ ] Admin user thấy AdminLayout với 6 menu items
- [ ] Menu click navigate đúng route, highlight active
- [ ] `useAuthStore.user.isAdmin` chuyển từ false → true, admin pages visible ngay (không cần refresh — verify bằng cách login rồi vào)
- [ ] Vietnamese strings dùng i18n namespace `vi/admin.json`

## Risk Assessment

| Risk | Mitigation |
|---|---|
| antd theme không align DESIGN.md | Audit tokens ở `AppProviders.tsx`, update nếu cần |
| `useAuthStore` chưa có `isAdmin` được gọi từ `getUserApi` | Confirm ở `authApi.ts` — nếu thiếu, thêm vào (gọi `getUserApi` trong `getUser()`) |
| `AdminLayout` thay đổi KLayout rule | Verify KLayout chỉ áp dụng cho `/k/*`, admin có layout riêng |
| i18n namespace conflict | Tạo `vi/admin.json` riêng, không merge vào `vi/common.json` |
| Sidebar admin link conflict với KLayout | Phase 10 mới thêm link "Trang quản trị" ở KLayout; phase này chưa cần |

## Security Considerations

- `AdminRoute` check `user?.isAdmin === true` — strict equality, tránh `if (isAdmin)` truthy bypass.
- Loading state quan trọng: nếu `useAuthStore.initializing === true` thì KHÔNG redirect, hiện spinner — tránh flash redirect khi user vừa load `getUserApi()` xong.
- Không để lộ admin endpoints URL trong error message của frontend.

## Next steps

- Phase 01 (backend infra) chạy song song — không phụ thuộc.
- Phase 08 (overview + stats pages) cần `adminApi.ts` + `useAdminStore` + `AdminLayout` từ phase này.
- Phase 09 (users + finance + logs + audit) cũng vậy.

## Implementation Notes

- All 6 admin pages stubbed as placeholders (filled in phases 08/09)
- AdminRoute guard checks `useAuthStore.user.isAdmin === true`, redirects non-admin to `/k`
- adminApi.ts typed surface covers all endpoints including SSE log tail
- useAdminStore with per-slice cache (5 min TTL) + invalidate helpers
- AdminLayout with sidebar (6 items) + topbar + content outlet
- 6 routes wired in `src/routes/index.tsx`
- `vi/admin.json` + `en/admin.json` created with Vietnamese strings
- `AdminOverviewPage.tsx` stub created (filled in phase 08)
