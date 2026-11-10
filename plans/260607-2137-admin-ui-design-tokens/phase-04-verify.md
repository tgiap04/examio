# Phase 04 — Verify

## Commands
```bash
cd /Users/tgiap.dev/devs/kmaedu/kmaedu-fe

# 1. Grep for any remaining non-brand colors / hardcoded hex / dark: variants
grep -rE "gray-|slate-|zinc-|stone-|text-(red|blue|green|yellow|orange|purple|pink|indigo|violet|sky|emerald|teal|cyan|amber|lime|fuchsia)-[0-9]|bg-(red|blue|green|yellow|orange|purple|pink|indigo|violet|sky|emerald|teal|cyan|amber|lime|fuchsia)-[0-9]|dark:" src/pages/admin/ src/components/admin/ src/routes/layouts/AdminLayout.tsx

# 2. Grep for hardcoded hex/rgb in admin files
grep -nE "#[0-9a-fA-F]{3,8}|rgba\(|rgb\(" src/pages/admin/*.tsx src/components/admin/*.tsx src/routes/layouts/AdminLayout.tsx

# 3. Grep for any remaining antd Tag with color prop in admin components
grep -nE 'Tag color=' src/components/admin/

# 4. Type check
yarn tsc --noEmit

# 5. Lint
yarn lint
```

## Visual verification (manual, not in script)

Open each route in a browser:
- `/admin` — verify h1 in Cormorant Garamond weight 400, 4 KPI cards in 12px radius, 3 mini-charts in 12px radius, error retry button uses hairline border.
- `/admin/stats` — verify 3 large charts render with coral series lines/bars/area, axis text in muted token, tooltips with canvas bg + hairline border.
- `/admin/users` — verify table, badge pills for Admin/Verified/Banned, no `geekblue/green/red` antd colors.
- `/admin/finance` — verify h1 + h2, 3 antd buttons styled via ConfigProvider, audit table below uses BadgePill.
- `/admin/audit` — verify filter row + table.
- `/admin/logs` — verify dark terminal uses `--surface-dark` background, hairline text, no `shadow-inner`.

## Pass criteria
- All 5 grep commands return 0 matches.
- `tsc --noEmit` exits 0.
- `yarn lint` exits 0 (warnings OK, errors not OK).
- All 6 admin pages visually confirm DESIGN.md compliance.
