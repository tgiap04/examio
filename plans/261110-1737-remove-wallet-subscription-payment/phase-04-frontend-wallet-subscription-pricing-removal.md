# Phase 04 — Frontend wallet, subscription, pricing removal

## Context Links
- [plan.md](./plan.md) · [scout-03](./reports/scout-03-frontend.md)

## Overview
- Priority: P1 · Status: Completed · Effort: 1.5d · Has no backend dependency; runs in parallel with 02 and 03. Must be in the branch before 05 regenerates `permissions.generated.ts`.
- Delete 27 FE files (wallet, subscription and payment APIs, stores, pages, pricing, admin finance) and edit about 20 source files plus locales. Optional dead upsell UI is cleaned in the same pass where it is cheap.

## Key Insights
- The FE has no 402, credit or upsell error handling and no AI chat page, so no runtime behaviour beyond these pages changes.
- After 05 regenerates the permission types, `wallet:use`, `subscription:manage` and `finance:admin` stop existing. Removing every reference **now** keeps the FE compiling both before and after the regen. Compile-break sites: `routes/index.tsx:133,182`, `nav-items.ts:64`, `PricingBand.tsx:85`, `ProfilePage.tsx:33`.
- Keep `lib/rbac/api-error-policy.ts` (`RATE_LIMITED` is generic) and `MODEL_INSUFFICIENT_VRAM`.
- Audit labels: drop the `admin.finance.*` labels (the DB resets). Unknown actions must fall back to the raw action string.

## Requirements
- Functional: no route, nav item, landing section, profile card or admin page refers to wallet, subscription, pricing or revenue. `/k/subscription` and `/admin/finance` fall through to the not-found handling.
- AI generator: drop `loadBalance` (live calls 532-533, 721-722) and the commented credit blocks. `newBalance` is gone from the `aiApi`/`examApi` types.
- Non-functional: `yarn build` (tsc -b + vite), `yarn lint` and `yarn test` all green. Locales are valid JSON in en, vi and ja.

## Architecture
- Store reset: `reset-role-scoped-state.ts` drops `useWalletStore`. Admin overview and stats KPIs show user and content metrics only, and the revenue chart is removed.

## Related Code Files (FE = `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe`)
- Delete:
  - `FE/src/apis/{walletApi.ts,subscriptionApi.ts}`
  - `FE/src/stores/useWalletStore.ts` (+`.test.ts`)
  - `FE/src/lib/wallet/**`
  - `FE/src/lib/creditUtils.ts`
  - `FE/src/lib/finance-action-body.ts` (+test)
  - `FE/src/lib/idempotency-key.ts` (+test)
  - `FE/src/pages/k/SubscriptionPage.tsx`
  - `FE/src/pages/admin/AdminFinancePage.tsx`
  - `FE/src/components/admin/FinanceActionModal.tsx`
  - `FE/src/templates/SubscriptionTemplate.tsx`
  - `FE/src/components/atoms/subscription/CreditPackageCard.tsx`
  - `FE/src/components/molecules/subscription/**`
  - `FE/src/components/organisms/subscription/QRPaymentDialog.tsx`
  - `FE/src/components/organisms/PricingSection.tsx`
  - `FE/src/components/molecules/PricingTable.tsx`
  - `FE/src/components/organisms/landing/{PricingBand.tsx,PricingCards.tsx}`
- Modify:
  - `FE/src/routes/index.tsx` (16, 55, 133, 182)
  - `FE/src/lib/rbac/nav-items.ts` (64) and `nav-items.test.ts` (57: 9 → 8)
  - `FE/src/routes/layouts/AdminLayout.tsx` (8, 33)
  - `FE/src/lib/admin-roles/permission-groups.ts` (23, 30)
  - `FE/src/stores/reset-role-scoped-state.ts` (19, 46)
  - `FE/src/stores/useAIGeneratorStore.ts`
  - `FE/src/apis/{aiApi.ts:68, examApi.ts:17, adminApi.ts}`
  - `FE/src/pages/k/ProfilePage.tsx`
  - `FE/src/pages/admin/{AdminOverviewPage.tsx, AdminStatsPage.tsx, AdminAuditPage.tsx}`
  - `FE/src/components/admin/{UserDetailDrawer.tsx, AuditTable.tsx}`
  - `FE/src/pages/landing/HomePage.tsx`
  - `FE/src/components/organisms/FooterSection.tsx:37`
  - `FE/src/components/atoms/ProfileDropdown.tsx` and `FE/src/components/organisms/k/SideBar.tsx:33` (PRO badge)
  - `FE/tsconfig.json:54`
  - Locales `FE/public/locales/{en,vi}/admin.json` and `FE/public/locales/{en,vi,ja}/{common,landing}.json` (`pricing.*`, wallet/finance keys)
- Optional, same pass if under 30 min: `TrendingSidebar.tsx`, `SettingsSidebar.tsx`, `SettingsTemplate.tsx`, `Notification*` billing filters, `CoralCallout.tsx`, and the unused `currency-vnd` formatter.
- NOT owned: `FE/src/types/permissions.generated.ts` (regenerated in 05).

## Implementation Steps
1. RED tests:
   - `nav-items.test.ts` expects 8 admin items with no `/admin/finance`.
   - A `permission-groups` test asserts there is no `wallet` group.
   - A `reset-role-scoped-state` test, if present, no longer resets a wallet store.
2. Delete the files, fix imports (follow `yarn build` errors), and edit routes, nav and layout.
3. Remove `useCan('wallet:use' | 'subscription:manage' | 'finance:admin')` everywhere: `git grep -n "wallet:use\|subscription:manage\|finance:admin" -- kmaedu-fe/src ':!kmaedu-fe/src/types/permissions.generated.ts'` should return nothing.
4. Trim the adminApi types and the admin pages. The audit fallback label must show the raw action.
5. Locales: remove the keys, then check that no `t('pricing.` or `t('wallet` usages remain (`git grep -n "pricing\.\|wallet\." -- kmaedu-fe/src`).
6. `yarn build && yarn lint && yarn test`.

## Todo List
- [ ] RED nav and permission-group tests (tests exist; a red-first run is not recorded)
- [x] Delete 27 files (spot-checked: walletApi, useWalletStore, SubscriptionPage, AdminFinancePage absent)
- [x] Routes, nav, layout, stores, APIs (no wallet or subscription symbols in `kmaedu-fe/src`)
- [x] Profile, landing, admin pages (no PricingBand or PricingSection references)
- [ ] Locales en, vi, ja (no literal `pricing.`/`wallet.` use left; locale JSON validity not checked)
- [ ] build, lint, test green (not recorded in any report)
- [ ] Browser pass with `yarn dev` (owed; see plan Follow-ups)

## Success Criteria
- No reference to the three permissions outside the generated file. No `walletApi`, `subscriptionApi` or `useWalletStore` symbols.
- `yarn build` exits 0, and still exits 0 after 05 regenerates the permission types (re-run in 05).

## Test Plan — Scope Contract (SAFETY-CRITICAL: authz UX gating, price/balance display removal)
- Changed: FE routes, nav, stores, APIs, admin and landing pages, locales.
- Impacted: route guards (`RequirePermission`), role-scoped reset, admin dashboards.
- Will verify:
  - `cd kmaedu-fe && yarn test` (whole vitest suite: `lib/rbac`, `admin-roles`, nav-items)
  - `yarn build` (strict tsc; catches dangling imports and permission literals)
  - `yarn lint` (unused-imports)
- Bugs caught: dangling route to a deleted page, a permission literal not in the catalog, a stale store reset import, missing locale keys rendered raw (manual spot-check below).
- UI check (layout changed on 4 pages): one manual run of `yarn dev`. Open landing, `/k/profile`, `/admin` overview, stats and audit, and the user drawer, and confirm no empty cards or `pricing.*` raw keys. A browser checkpoint is allowed here because layout changed; no logic is tested in the browser.
- Deliberately skipped: e2e browser automation (no logic change).

## Risk Assessment
- A hidden import of a deleted component through a barrel → build error. Countermeasure: `yarn build` iterates until clean.
- Removing a landing section leaves a broken anchor (`/#pricing`). Countermeasure: the footer link is removed.
- Rollback: revert the FE commits (FE-only).

## Security Considerations
- FE gating is UX only; the backend enforces. Nothing here grants new access.

## Next Steps
- 05 runs `yarn gen:fe-permissions` and re-runs `yarn build`.
