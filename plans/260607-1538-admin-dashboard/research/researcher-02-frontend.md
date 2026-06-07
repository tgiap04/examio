# Research Report — Frontend Admin Dashboard Patterns

Work context: `/Users/tgiap.dev/devs/examio/examio-fe`
Date: 2026-06-07

## 1. Routes wiring

- File: `src/routes/index.tsx:55-352` — flat `createBrowserRouter` array, no nested router.
- All `/k/*` routes use the same pattern (see `index.tsx:153-347`):
  ```tsx
  element: (
    <ProtectedRoute>
      <KLayout>
        <PageComponent />
      </KLayout>
    </ProtectedRoute>
  )
  ```
- Admin routes follow the same shape, but `<KLayout>` is replaced with `<AdminLayout>`. The wrapper remains `<AdminRoute>` (composed *inside* `<AdminRoute>` so the layout can read the verified admin user).
- Admin user can still hit `/k/*` — the gate at `AdminRoute` does NOT block other routes. KLayout/KRootRedirect already let the user through; admin flag is independent.
- Add 6 routes (parallel to `index.tsx:153-347`):
  - `/admin` → `AdminOverview`
  - `/admin/users` → `AdminUsers`
  - `/admin/stats` → `AdminStats`
  - `/admin/finance` → `AdminFinance`
  - `/admin/logs` → `AdminLogs`
  - `/admin/audit` → `AdminAudit`

## 2. AdminRoute guard

- Model on `src/routes/guards/TeacherRoute.tsx:5-21` (it already checks auth + initializing).
- Add `isAdmin` check from `useAuthStore` (which exposes `user.isAdmin` per `src/types/user.ts:14`).
- Signature: `export function AdminRoute({ children }: PropsWithChildren)`.
- Fallback: `if (!user?.isAdmin) return <Navigate to="/k" replace />` — non-admins bounce to user home. `TeacherRoute` redirects to `/login`; admin bounce to `/k` is friendlier since they're logged in.
- Must check `initializing` to avoid flash of redirect (see `ProtectedRoute.tsx:10-16`).
- Optional: keep `setRedirectBackTarget` for return-to support like `ProtectedRoute.tsx:19-21`, but for hard 403 → `/k` is simpler.

## 3. `adminApi.ts` — structure

Model on `src/apis/subscriptionApi.ts:1-167`:
- Single import `import { api } from "./api";` — gets interceptors, device header, 401-refresh, SESSION_INVALIDATED handling (`src/apis/api.ts:87-201`).
- Export typed request/response interfaces first.
- One named async function per endpoint, returns `response.data`.
- Use `api.get/post/patch/delete` with `params` for query strings.

Functions needed:
```ts
getOverviewApi()                  → GET  /admin/overview
listUsersApi(params)              → GET  /admin/users            (search, role, status, page, size)
getUserDetailApi(id)              → GET  /admin/users/:id
updateUserApi(id, body)           → PATCH /admin/users/:id
banUserApi(id, reason)            → POST /admin/users/:id/ban
getSystemStatsApi(range)          → GET  /admin/stats?range=7d|30d|90d
listFinanceActionsApi(params)     → GET  /admin/finance
refundApi(paymentId, body)        → POST /admin/finance/refund
creditApi(userId, body)           → POST /admin/finance/credit
setTierApi(userId, body)          → POST /admin/finance/tier
tailLogsApi(onLine, onError)      → opens SSE; returns EventSource
listAuditApi(params)              → GET  /admin/audit
```

## 4. `useAdminStore.ts` — Zustand pattern

Model on `src/stores/useStatsStore.ts:37-109`:
- Single `create<Store>((set, get) => …)` with `set` for state and `get` for guards against duplicate fetches.
- One loading flag per resource: `loadingUsers`, `loadingOverview`, etc.
- Invalidate helpers (`invalidateUsers`, …) called after mutations.
- Cache pattern from `useStatsStore.ts:45`: `if (get().users || get().loadingUsers) return;` — preserves the in-memory cache across page navigation per performance rules.

Suggested slices (don't over-engineer):
```ts
overview, users, userDetail, stats, financeActions, audit;
loadings: Record<keyof Data, boolean>;
fetchers per slice; mutators (banUser, refund, credit, setTier) → call adminApi → invalidate
```

## 5. DataTable pattern (AdminUsersPage)

- antd `Table` is NOT yet used (the codebase has a custom shadcn-style `src/components/antd/table.tsx`). Confirm during impl: do we install `antd` Table directly or extend the shadcn one? Decision needed — see unresolved Qs.
- Pattern from `src/pages/k/ExamRoomSessionAnalyticsPage.tsx:14-57`: recharts + custom shadcn Table + Skeleton loading.
- For 100+ row admin tables, prefer `antd` `Table` with `pagination`, `scroll={{ x: 1200 }}`, `onChange` for sort/filter, and a filter `Form` row above (Search input + role Select + status Select).
- Column render functions for actions: use `Space` for icon buttons, `Popconfirm` for destructive actions, `Tag` for status pills.

## 6. Recharts integration

Already in use — see `src/pages/k/ExamRoomSessionAnalyticsPage.tsx:14-26`:
```ts
Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
```
For admin dashboard add: `LineChart`, `AreaChart` (revenue over time), `Line` (DAU trend). Wrap every chart in `<ResponsiveContainer width="100%" height={300}>`.

Data shape (assumed, to confirm with backend):
```ts
{ name: "2026-06-01", value: 1234 }   // LineChart
{ name: "Free", value: 1000 }         // PieChart
{ date: "2026-06", revenue: 5_000_000, refunds: 200_000 }  // AreaChart
```

## 7. SSE (log tail)

- `EventSource` is browser-native; instantiate in `useEffect`, close in cleanup.
- `api.ts` does not currently expose SSE; adminApi must use raw `fetch` or a dedicated `new EventSource(env.apiUrl + "/admin/logs/stream", { withCredentials: true })`.
- Auth: standard `EventSource` does NOT support custom headers. Need a `?token=` query param OR short-lived ticket endpoint. **Unresolved Q1.**
- Reconnect: handle `onerror` → `eventSource.close()` → retry with backoff (1s, 2s, 5s, max 30s). Stop after N failures to avoid loop.
- Lifecycle: keep EventSource in a ref; expose `start/stop` actions on the store; auto-stop on unmount.

## 8. Modal 2-step confirm

- The codebase has shadcn `Dialog` (`src/components/antd/dialog.tsx`) and radix `alert-dialog`; the actual `antd` package's `Modal.confirm` is the cleanest for 2-step flows.
- Antd `Modal.confirm` accepts `onOk: () => Promise<void>` — the OK button shows spinner until the promise resolves (`src/apis/api.ts:104`).
- For 2-step refund/credit/tier: open first confirm ("Bạn có chắc?") → onOk opens a second `Modal` (a real form with amount/reason/tier) → on submit of second modal call API → close both + toast.
- Reuse shadcn `Dialog` for the form modal to keep visual consistency; antd `Modal.confirm` for the trigger.

## 9. Design tokens (from `/Users/tgiap.dev/devs/examio/DESIGN.md`)

Already wired in `src/provider/AppProviders.tsx:11-46` as `antd` `ConfigProvider` token. Reuse as-is:

| DESIGN.md token | hex | antd theme key |
|---|---|---|
| `colors.primary` (coral) | `#cc785c` | `colorPrimary` |
| `colors.primary-active` | `#a9583e` | `colorPrimaryActive` (use via `Button` algorithm) |
| `colors.error` | `#c64545` | `colorError` |
| `colors.warning` | `#d4a017` | `colorWarning` |
| `colors.success` | `#5db872` | `colorSuccess` |
| `colors.canvas` | `#faf9f5` | `colorBgContainer` |
| `colors.hairline` | `#e6dfd8` | `colorBorder` |
| `colors.ink` | `#141413` | `colorText` |
| `colors.muted` | `#6c6a64` | `colorTextSecondary` |
| `rounded.md` (8) | — | `borderRadius` |
| `rounded.lg` (12) | — | `Modal.borderRadiusLG` |

Tailwind tokens (from `tailwind.config` `colors:` block, same DESIGN.md hexes): `bg-canvas`, `bg-surface-soft`, `bg-surface-card`, `text-ink`, `text-body`, `text-muted`, `border-hairline`, `bg-coral`, `text-coral`, `font-display` (serif headlines).

For admin: use the **dark-navy surface** (`colors.surface-dark` `#181715`) for KPI cards or top stats band to create the cream→dark rhythm the design system prescribes. Don't paint the whole page dark — keep the editor/data tables on cream and reserve dark for at-a-glance metric tiles.

## 10. Form validation

- Existing pattern: `src/components/molecules/profile/ProfileForm.tsx:1-80` uses **plain React state + manual submit + `onSubmit` prop** (no zod, no antd Form).
- The codebase does NOT use `antd` `Form` or zod in the current pages (despite `nestjs-zod` on the backend). Confirmed by `grep` returning no hits.
- For admin: prefer **antd `Form` + `rules`** for the 2-step refund/credit/tier modals — these have many fields (amount, reason, tier) and benefit from built-in validation messages. For simple search filters, plain controlled inputs.
- Zod is acceptable for finance actions if you want type-safe validation shared with backend; not required for MVP.

## 11. isAdmin check + getUserApi

- Field exists: `src/types/user.ts:14` — `isAdmin: boolean`.
- Returned by `getUserApi` (called by `useAuthStore.getUser` at `src/stores/useAuthStore.ts:252-273`).
- Existing usage: `src/lib/genai-knowledge-access.ts:18,21` reads `user.isAdmin` to gate GenAI tutor access — confirms the field is populated and trustworthy on the client.

## Unresolved Questions

1. **SSE auth header** — `EventSource` cannot send `Authorization`. Options: (a) backend accepts `?token=` query, (b) short-lived ticket endpoint, (c) fetch-streaming (ReadableStream) instead. Pick one before building the logs page.
2. **Table library** — antd `Table` vs current shadcn `table.tsx`? The shadcn one has no pagination/sort/filter built-in. For admin tables of users/finance/audit we likely want antd; need user confirmation.
3. **Backend contract** — none of the `/admin/*` endpoints, request/response shapes, or pagination conventions are documented. Must be produced by the backend researcher before adminApi is finalized.
4. **Vietnamese strings** — confirm tone (tu/anh) for destructive actions: "Hoàn tiền" vs "Refund", "Khóa tài khoản" vs "Ban". One source of truth needed (i18n keys or a `vi.ts` dict).
5. **AdminEntry in KLayout nav** — should the KLayout sidebar show an "Trang quản trị" link for admins? Recommend yes, gated on `user.isAdmin`. Confirms the cross-access UX.
6. **i18n file path** — repo uses `react-i18next` (per `useTranslation("common")` in routes); admin pages should reuse the same `vi` namespace or a new `admin` namespace. Decision needed.
