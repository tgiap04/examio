# Phase 02 — Layout, components: token + typography + Tag swap

## Goal
Apply the bulk of the token + Tag replacements across the 1 layout file and 9 component files. Pages left for Phase 03.

## Files (10)

### 1. `examio-fe/src/routes/layouts/AdminLayout.tsx`
- Replace 4 `bg-[#faf9f5]` → `bg-canvas` (root, aside, header, logout button).
- Header h1: `text-base font-semibold md:text-lg` → `text-base md:text-lg font-display font-normal tracking-tight text-ink`.
- Sidebar brand: `text-lg font-semibold` → `text-lg font-display font-normal tracking-tight`.

### 2. `examio-fe/src/components/admin/KpiCard.tsx`
- `rounded-xl` → `rounded-lg`.
- Verify h1-style value uses `font-display` already (yes, line 54) — keep.

### 3. `examio-fe/src/components/admin/MiniChartCard.tsx`
- Drop `const PRIMARY/GRID/AXIS_TEXT` raw-hex lines 34-36.
- Replace all 3 chart references with `var(--coral)`, `var(--hairline)`, `var(--muted-text)`.
- Replace 3× tooltip `contentStyle` inline hex with `backgroundColor: "var(--canvas)"`, `border: "1px solid var(--hairline)"`, `borderRadius: 8`, `fontSize: 12`, `color: "var(--ink)"`.
- `rounded-xl` → `rounded-lg`.
- `p-5` → `p-6`.

### 4. `examio-fe/src/components/admin/StatChart.tsx`
- Same hex-const + tooltip pattern as MiniChartCard.
- `rounded-xl` → `rounded-lg`.
- `p-5` → `p-6`.

### 5. `examio-fe/src/components/admin/RangeSelector.tsx`
- `bg-coral text-white` → `bg-coral text-on-primary`.

### 6. `examio-fe/src/components/admin/LogViewer.tsx`
- `bg-[#181715] text-[#e6dfd8] shadow-inner` → `bg-surface-dark text-on-dark` (drop shadow-inner).
- Empty state `text-[#a99f91]` → `text-on-dark-soft`.
- `rounded-md border border-hairline` — keep (terminal sub-component, `{spacing.sm}` radius per design system).

### 7. `examio-fe/src/components/admin/AuditTable.tsx`
- Pre block `bg-[#faf9f5]` → `bg-canvas`.
- Replace `actionColor(val)` function + `<Tag color={...}>` with new `auditActionVariant(val)` returning `BadgeVariant`, then `<BadgePill variant={...}>{val}</BadgePill>`.

### 8. `examio-fe/src/components/admin/UserTable.tsx`
- Replace 3 `<Tag color="...">` usages with `<BadgePill variant="positive|negative|neutral">`.

### 9. `examio-fe/src/components/admin/UserDetailDrawer.tsx`
- Replace 4 `<Tag color="...">` usages with `<BadgePill>`.
- All 4 `h3` section headers: drop `uppercase`, switch to `font-display font-normal tracking-tight text-ink/70`.

### 10. `examio-fe/src/components/admin/LogStreamPanel.tsx`
- Replace `statusColor()` (returns antd color string) with `statusVariant()` (returns `BadgeVariant`).
- Replace `<Tag color={statusColor(esStatus)}>` with `<BadgePill variant={statusVariant(esStatus)}>`.
- Label `text-ink/60` → keep (token-driven, fine).
- Tag chip in `ml-auto` cluster: keep, but `BadgePill` is already token-driven.

## Success
- All 10 files modified.
- `grep -E "Tag color=|bg-\[#|text-\[#|shadow-inner" examio-fe/src/routes/layouts/AdminLayout.tsx examio-fe/src/components/admin/` returns 0 matches.
- `grep -nE "#[0-9a-fA-F]{3,8}" examio-fe/src/components/admin/ examio-fe/src/routes/layouts/AdminLayout.tsx` returns 0 matches.
