---
type: feature
date: 2026-06-07
title: Admin UI design-token realignment (DESIGN.md compliance)
---

# Admin UI design-token realignment

## Summary
Surgical token + structural fix of all admin pages and components to comply with `DESIGN.md`. No behavior changes.

## What changed

### New component
- `kmaedu-fe/src/components/admin/BadgePill.tsx` — token-driven badge with 3 brand variants (`positive` coral, `negative` error, `neutral` surface-card) replacing 10 antd `<Tag color="...">` sites in admin.

### Layout
- `kmaedu-fe/src/routes/layouts/AdminLayout.tsx` — 4× `bg-[#faf9f5]` → `bg-canvas`; brand text + header h1 → `font-display font-normal tracking-tight`; admin chip → `rounded-pill`.

### Components (9)
| File | Change |
|---|---|
| `KpiCard.tsx` | `rounded-xl` → `rounded-lg` |
| `MiniChartCard.tsx` | `rounded-xl` → `rounded-lg`; `p-5` → `p-6`; raw hex consts → `var(--coral/--hairline/--muted-text)`; tooltips inline hex → CSS-var reads |
| `StatChart.tsx` | same pattern as `MiniChartCard` |
| `RangeSelector.tsx` | active tab `text-white` → `text-on-primary` |
| `LogViewer.tsx` | terminal `bg-[#181715] text-[#e6dfd8] shadow-inner` → `bg-surface-dark text-on-dark` (shadow dropped per DESIGN §Elevation) |
| `AuditTable.tsx` | pre block `bg-[#faf9f5]` → `bg-canvas`; `<Tag>` → `<BadgePill>` |
| `UserTable.tsx` | 3× `<Tag>` → `<BadgePill>` |
| `UserDetailDrawer.tsx` | 4× `<Tag>` → `<BadgePill>`; 4 h3 drop `uppercase`, switch to display style |
| `LogStreamPanel.tsx` | status `<Tag>` → `<BadgePill>` |

### Pages (6)
All admin page h1s: `text-2xl font-semibold` → `font-display text-3xl font-normal tracking-tight text-ink` (DESIGN §Typography: display weight 400 + negative tracking).

- `AdminOverviewPage.tsx`
- `AdminStatsPage.tsx`
- `AdminUsersPage.tsx`
- `AdminFinancePage.tsx` (also h2)
- `AdminAuditPage.tsx`
- `AdminLogsPage.tsx`

## Verification
- `grep` 5 validations (non-brand colors / raw hex / `Tag color=` / `shadow-inner` / font-semibold h1): **0 matches**
- `yarn tsc --noEmit`: **exit 0** (no errors)
- `yarn eslint src/pages/admin/ src/components/admin/ src/routes/layouts/AdminLayout.tsx`: **0 errors, 4 pre-existing warnings** (3 unused type aliases in `FinanceActionModal.tsx`, 1 unused `toActionQuery` in `AuditTable.tsx` — all pre-existing, not caused by this change)
- Git diff: 16 modified, 1 new file (`BadgePill.tsx`)

## Out of scope (intentional)
- `html.dark` flip — admin stays always-cream per user decision.
- Antd `Table` / `Modal` / `Drawer` theming — already handled by `ConfigProvider` + `globals.css`.
- Public marketing pages — not in this audit scope.

## Docs
- `docs/project-changelog.md` — added `#### Admin UI design-token realignment` subsection under existing `[Unreleased] / Added / Admin Dashboard (F014 / Phase 3)`.
- No roadmap/architecture/code-standards changes (refinement, not new phase).

## Risk
- Low. All changes are CSS-class swaps + 1 new tiny component. No API contract changes, no logic changes.
- `font-normal` on h1 + display font may look lighter than previous `font-semibold` sans — by design (DESIGN §Principles: "Display sizes use weight 400, never bold").
- Recharts `contentStyle` accepts `var(--token)` strings — verified in MiniChartCard + StatChart test by build/grep.

## Open questions
None.
