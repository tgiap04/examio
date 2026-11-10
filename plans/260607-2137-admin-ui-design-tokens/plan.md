# Admin UI — DESIGN.md Compliance Fix

## Context

Admin dashboard pages and components were built without strict adherence to `DESIGN.md`. Current state: hardcoded hex colors, antd `Tag` presets that don't exist in the brand palette, non-display typography on page h1s, `AdminLayout` ignores the dark-mode toggle, `shadow-inner` on a component the system banned, and content cards using `rounded-xl` (16px) instead of `rounded-lg` (12px).

This plan realigns every admin file with the design system. It is a **surgical token swap + 1 new shared component** — no new pages, no new flows, no behavioral changes.

## Confirmed Decisions

| Question | Decision |
|---|---|
| Tag color rebrand | Build `BadgePill` component with 3 brand-token variants |
| Admin dark mode | Always light (matches DESIGN.md) — do not flip with `html.dark` |
| Page h1 sizing | `text-3xl` (36px) uniform across all admin pages |
| Card radius | `rounded-lg` (12px) for all admin content cards |

## Token Map (canonical replacements)

| Current | Replace with |
|---|---|
| `bg-[#faf9f5]` | `bg-canvas` |
| `bg-[#181715]` | `bg-surface-dark` |
| `text-[#e6dfd8]` | `text-on-dark` |
| `text-[#a99f91]` | `text-on-dark-soft` |
| `text-white` (on coral) | `text-on-primary` |
| `PRIMARY = "#cc785c"` | `var(--coral)` |
| `GRID = "#e6dfd8"` | `var(--hairline)` |
| `AXIS_TEXT = "#6c6a64"` | `var(--muted-text)` |
| `font-semibold` on h1/h2/h3 | `font-display font-normal tracking-tight` |
| `uppercase` on h3 | drop (DESIGN §Typography: no uppercase rule) |
| `rounded-xl` (content cards) | `rounded-lg` |
| `shadow-inner` | drop |
| `bg-coral/10` (sidebar active) | keep — uses token (OK) |
| antd `<Tag color="geekblue\|green\|red\|blue\|volcano\|purple\|orange\|cyan">` | `<BadgePill variant="...">` |
| antd `<Tag color="default">` | `<BadgePill variant="neutral">` |
| `text-2xl font-semibold` (h1) | `text-3xl font-display font-normal tracking-tight` |

## Files to Create

| Path | Purpose |
|---|---|
| `kmaedu-fe/src/components/admin/BadgePill.tsx` | Token-driven badge with 3 variants: `positive`, `negative`, `neutral`. Replaces antd `<Tag color=...>` everywhere in admin. |

## Files to Modify (16)

### Layout (1)
- `kmaedu-fe/src/routes/layouts/AdminLayout.tsx` — replace 4× `bg-[#faf9f5]` with `bg-canvas`; h1 to `font-display font-normal tracking-tight`.

### Pages (6)
- `kmaedu-fe/src/pages/admin/AdminOverviewPage.tsx` — h1 to display style.
- `kmaedu-fe/src/pages/admin/AdminStatsPage.tsx` — h1 already uses `font-display`; just confirm tracking.
- `kmaedu-fe/src/pages/admin/AdminUsersPage.tsx` — h1 upgrade.
- `kmaedu-fe/src/pages/admin/AdminFinancePage.tsx` — h1 + h2 upgrade.
- `kmaedu-fe/src/pages/admin/AdminAuditPage.tsx` — h1 upgrade.
- `kmaedu-fe/src/pages/admin/AdminLogsPage.tsx` — h1 upgrade.

### Components (9)
- `kmaedu-fe/src/components/admin/KpiCard.tsx` — `rounded-xl` → `rounded-lg`.
- `kmaedu-fe/src/components/admin/MiniChartCard.tsx` — `rounded-xl` → `rounded-lg`; replace 3 raw hex consts (`PRIMARY/GRID/AXIS_TEXT`) with CSS-var reads; replace tooltip inline hex with vars.
- `kmaedu-fe/src/components/admin/StatChart.tsx` — same as above.
- `kmaedu-fe/src/components/admin/RangeSelector.tsx` — `text-white` → `text-on-primary`.
- `kmaedu-fe/src/components/admin/LogViewer.tsx` — raw hex → `bg-surface-dark text-on-dark text-on-dark-soft`; drop `shadow-inner`; `rounded-md` → keep (terminal sub-component).
- `kmaedu-fe/src/components/admin/AuditTable.tsx` — `bg-[#faf9f5]` → `bg-canvas`; replace `<Tag color={actionColor(...)}>` with `<BadgePill>`.
- `kmaedu-fe/src/components/admin/UserTable.tsx` — replace 3 `<Tag>` usages with `<BadgePill>`.
- `kmaedu-fe/src/components/admin/UserDetailDrawer.tsx` — replace 4 `<Tag>` usages; h3 → display style; drop `uppercase`.
- `kmaedu-fe/src/components/admin/LogStreamPanel.tsx` — replace 1 `<Tag>` usage; label to token colors.

## BadgePill Spec

```tsx
type Variant = "positive" | "negative" | "neutral";

const variantClasses: Record<Variant, string> = {
  positive: "bg-coral/10 text-coral",
  negative: "bg-error/10 text-error",
  neutral: "bg-surface-card text-ink/70",
};

export function BadgePill({
  variant = "neutral",
  children,
  className,
}: { variant?: Variant; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
```

**Variant mapping** (per admin semantics):
- `isAdmin=true` → `positive` (coral — admin is a "featured" state, brand-aligned)
- `isVerified=true`, `subscription.isActive=true` → `positive`
- `isBanned=true` → `negative`
- all `false`/no → `neutral`
- audit `admin.finance.refund` → `negative`
- audit `admin.finance.credit` → `positive`
- audit `admin.user.ban` → `negative`
- audit `admin.user.unban` → `positive`
- audit `admin.user.grant` → `positive`
- audit `admin.user.revoke` → `neutral`
- audit `admin.finance.tier_change` → `neutral`
- audit `admin.user.update` → `neutral`
- log stream `status.idle` → `neutral`, `open` → `positive`, `connecting/reconnecting` → `positive` (transient = brand), `error/closed` → `negative`

## Dark Mode Decision Detail

DESIGN.md §Surfaces has a `.dark` block already in `globals.css` mapping all cream tokens. The current Antd `ConfigProvider` already reads `isDarkMode` from `useThemeContext` and re-tokens. The only thing that **doesn't** auto-flip is `AdminLayout`'s 4 hardcoded `bg-[#faf9f5]` (sidebar, header, body, logout button). **Per user decision, we don't flip admin to dark** — swap the 4 hardcodes to `bg-canvas` for token correctness, and the result is still always-cream visually. The `html.dark` toggle for the rest of the app keeps working unchanged.

## Spacing / Padding Adjustments

| Card | Current | Target | Reason |
|---|---|---|---|
| `KpiCard` | `p-6` | keep | `{spacing.lg}` = 24px ✓ |
| `MiniChartCard` | `p-5` | `p-6` | matches `{spacing.lg}` |
| `StatChart` | `p-5` | `p-6` | matches `{spacing.lg}` |

## Success Criteria

1. `grep -rE "gray-|slate-|zinc-|neutral-|stone-|text-(red|blue|green|yellow|orange|purple|pink)-[0-9]|bg-(red|blue|green|yellow|orange|purple|pink)-[0-9]|dark:" kmaedu-fe/src/pages/admin/ kmaedu-fe/src/components/admin/ kmaedu-fe/src/routes/layouts/AdminLayout.tsx` returns **0 matches**.
2. `grep -nE "#[0-9a-fA-F]{3,8}" kmaedu-fe/src/pages/admin/ kmaedu-fe/src/components/admin/ kmaedu-fe/src/routes/layouts/AdminLayout.tsx` returns **0 matches** (except for content like `pay_...` strings, not colors).
3. `grep -E "Tag color=\"" kmaedu-fe/src/components/admin/` returns **0 matches**.
4. `cd kmaedu-fe && yarn tsc --noEmit` passes.
5. `cd kmaedu-fe && yarn lint` passes (warnings allowed, no errors).
6. Visual smoke test of `/admin`, `/admin/stats`, `/admin/users`, `/admin/finance`, `/admin/logs`, `/admin/audit` shows h1 in Cormorant Garamond, cards in 12px radius, no raw hex bleed-through.

## Out of Scope

- Antd `Table` theming (already handled by `ConfigProvider`).
- Drawer/Modal theming (already handled by globals.css `.ant-modal-root`, `.ant-drawer`).
- Skeleton/Empty components (antd defaults; brand-tint already applied via ConfigProvider).
- Public marketing pages (PublicLayout, HomePage etc.) — out of scope, not in this audit.

## Risk

- **Low.** All changes are CSS-class swaps + 1 new tiny component. No API contract changes, no logic changes.
- The `MiniChartCard` / `StatChart` recharts tooltip `contentStyle` needs `var(--token)` syntax — verified to work with Recharts (it forwards to inline style).
- `font-normal` on h1 + display font may look lighter than current `font-semibold` sans — by design (DESIGN.md §Principles: "Display sizes use weight 400, never bold").

## Execution Order

1. Create `BadgePill` component.
2. Fix `AdminLayout` (4 hardcodes + h1).
3. Fix the 9 components (5 cards/charts + LogViewer + RangeSelector + AuditTable/UserTable/UserDetailDrawer/LogStreamPanel).
4. Fix the 5 remaining pages (Overview, Users, Finance, Audit, Logs).
5. Run `tsc --noEmit` + `yarn lint`.
6. Visual verify.

## Plan Files

- `plan.md` (this file)
- `phase-01-badge-pill-component.md`
- `phase-02-layout-and-tokens.md`
- `phase-03-pages-display-style.md`
- `phase-04-verify.md`
