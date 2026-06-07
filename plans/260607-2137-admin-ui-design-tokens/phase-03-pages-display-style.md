# Phase 03 — Pages: display h1 upgrade

## Goal
Apply uniform display-style h1 (and h2) across all 6 admin pages. Some pages already partially comply; this phase finalizes.

## Standard h1 (final)
```tsx
<h1 className="font-display text-3xl font-normal tracking-tight text-ink">
  {t("pages.<x>.title")}
</h1>
```

## Standard subtitle (final)
```tsx
<p className="mt-1 text-sm text-ink/60">
  {t("pages.<x>.subtitle")}
</p>
```

## Files (6)

### 1. `AdminOverviewPage.tsx` (line 65-71)
- Current: `font-display text-3xl text-ink` — already correct shape, add `font-normal tracking-tight`.
- Subtitle: `mt-1 text-sm text-ink/60` ✓.
- ErrorBlock `text-ink/70` ✓ (token).

### 2. `AdminStatsPage.tsx` (line 47-52)
- Current: `font-display text-3xl text-ink` — same fix, add `font-normal tracking-tight`.
- Subtitle ✓.

### 3. `AdminUsersPage.tsx` (line 9-11)
- Current: `text-2xl font-semibold` → `font-display text-3xl font-normal tracking-tight text-ink`.
- Subtitle ✓.

### 4. `AdminFinancePage.tsx` (line 14-16, 31-33)
- h1: `text-2xl font-semibold` → `font-display text-3xl font-normal tracking-tight text-ink`.
- h2 (line 31): `mb-3 text-base font-semibold` → `mb-3 font-display text-base font-normal tracking-tight text-ink/70`.

### 5. `AdminAuditPage.tsx` (line 51-53)
- h1: `text-2xl font-semibold` → display style.

### 6. `AdminLogsPage.tsx` (line 9-11)
- h1: `text-2xl font-semibold` → display style.

## What does NOT change
- Page layout (`space-y-4`/`space-y-6`) — already matches `{spacing.lg}`.
- Inner filters/buttons — handled by antd ConfigProvider tokens.
- Charts inside pages — already in components (Phase 02).

## Success
- All 6 page h1s use `font-display text-3xl font-normal tracking-tight text-ink`.
- `grep -E "text-2xl font-semibold|text-3xl font-semibold" examio-fe/src/pages/admin/` returns 0 matches.
- `grep -E "font-semibold" examio-fe/src/pages/admin/` returns 0 matches (h1/h2 should be font-normal display).
