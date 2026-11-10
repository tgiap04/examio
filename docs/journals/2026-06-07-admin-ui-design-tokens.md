---
title: "260607-2137-admin-ui-design-tokens"
session_date: 2026-06-07
plan: plans/260607-2137-admin-ui-design-tokens/
status: complete
---

# Session Journal — 260607-2137-admin-ui-design-tokens

## What

Surgical design-token realignment of all admin pages and components to comply with `DESIGN.md`. Follow-up to the dashboard implementation session (260607-1538).

## Frontend (kmaedu-fe/src)

### New component
- `components/admin/BadgePill.tsx` — 3 brand variants (`positive` / `negative` / `neutral`) replacing 10 antd `<Tag color="...">` sites in admin.

### Layout
- `routes/layouts/AdminLayout.tsx` — 4× `bg-[#faf9f5]` → `bg-canvas`; brand text + header h1 → display style; admin chip → `rounded-pill`.

### Components (9)
- `KpiCard.tsx` — `rounded-xl` → `rounded-lg`.
- `MiniChartCard.tsx` / `StatChart.tsx` — raw hex consts → CSS-vars; tooltips inline hex → CSS-var reads; `rounded-xl` → `rounded-lg`; `p-5` → `p-6`.
- `RangeSelector.tsx` — `text-white` → `text-on-primary`.
- `LogViewer.tsx` — terminal surface → `bg-surface-dark text-on-dark`; `shadow-inner` dropped.
- `AuditTable.tsx` — `<Tag>` → `<BadgePill>`; pre block `bg-canvas`.
- `UserTable.tsx` — 3× `<Tag>` → `<BadgePill>`.
- `UserDetailDrawer.tsx` — 4× `<Tag>` → `<BadgePill>`; 4 h3 → display style, drop `uppercase`.
- `LogStreamPanel.tsx` — status `<Tag>` → `<BadgePill>`.

### Pages (6)
All h1s: `text-2xl font-semibold` → `font-display text-3xl font-normal tracking-tight text-ink`. AdminFinance h2 same upgrade.

## User Decisions (via AskUserQuestion)
1. **Tag rebrand** → custom `BadgePill` component (3 brand variants).
2. **Admin dark mode** → always light, matches DESIGN.md.
3. **h1 size** → uniform `text-3xl` (36px) across all admin pages.
4. **Card radius** → `rounded-lg` (12px) for content cards.

## Verification

- `tsc --noEmit` — exit 0, 0 errors
- `eslint` (admin files only) — 0 errors, 4 pre-existing warnings (not from this change)
- 5 grep validations — 0 matches:
  - non-brand color classes
  - raw hex / rgb
  - `Tag color=`
  - `shadow-inner`
  - `font-semibold` on h1/h2

## Docs

- `docs/project-changelog.md` — added `#### Admin UI design-token realignment` subsection under existing `[Unreleased] / Added / Admin Dashboard (F014 / Phase 3)`.

## Out of Scope (intentional)
- `html.dark` flip on admin — user confirmed always-light.
- Antd `Table` / `Modal` / `Drawer` theming — already handled by `ConfigProvider` + `globals.css`.
- Public marketing pages.

## Risk
- Low. All changes are CSS-class swaps + 1 new tiny component. No API/logic changes.
- Display h1 (Cormorant Garamond weight 400 + tracking-tight) replaces previous sans-semibold — by DESIGN §Typography.

## Committed
- No — user said "Không commit".

## Next
- (carry to user) Optional: visual smoke test of `/admin`, `/admin/stats`, `/admin/users`, `/admin/finance`, `/admin/logs`, `/admin/audit`.
- (carry to user) Optional: start `yarn dev:admin` to verify 503s are gone now that admin-service is wired.
