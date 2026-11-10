# Scout 03 — Frontend (kmaedu-fe) wallet/subscription/payment footprint

Source: Explore agent, 2026-11-10 (read-only; saved by orchestrator). Paths under `kmaedu-fe/` unless prefixed `docs/`.

## Delete whole file (27)
- APIs/stores: `src/apis/walletApi.ts`, `src/apis/subscriptionApi.ts`, `src/stores/useWalletStore.ts`, `src/stores/useWalletStore.test.ts`
- lib: `src/lib/wallet/wallet-fetch-policy.ts` (+ `.test.ts`), `src/lib/wallet/wallet-refresh-queue.test.ts`, `src/lib/creditUtils.ts`, `src/lib/finance-action-body.ts` (+ `.test.ts`), `src/lib/idempotency-key.ts` (+ `.test.ts`) — only used by adminApi finance calls + FinanceActionModal
- Pages: `src/pages/k/SubscriptionPage.tsx`, `src/pages/admin/AdminFinancePage.tsx`, `src/components/admin/FinanceActionModal.tsx`
- Dead code: `src/templates/SubscriptionTemplate.tsx`, `src/components/atoms/subscription/CreditPackageCard.tsx`, `src/components/molecules/subscription/*` (CreditSlider, CreditStatisticsCard, SubscriptionPlanCard, TransactionHistoryTable, UsageBreakdownCard), `src/components/organisms/subscription/QRPaymentDialog.tsx`, `src/components/organisms/PricingSection.tsx`, `src/components/molecules/PricingTable.tsx`
- Landing: `src/components/organisms/landing/PricingBand.tsx`, `PricingCards.tsx`

## Edit (~20 src + 8 locale + docs)
- `src/routes/index.tsx`: 16, 55 (imports), 133 (`/k/subscription`), 182 (`finance` child)
- `src/lib/rbac/nav-items.ts:64` (`/admin/finance`); `nav-items.test.ts:57` length 9→8
- `src/routes/layouts/AdminLayout.tsx`: 8 (Wallet icon), 33 (finance nav)
- `src/lib/admin-roles/permission-groups.ts`: 23 (`wallet` group), 30
- `src/stores/reset-role-scoped-state.ts`: 19, 46
- `src/stores/useAIGeneratorStore.ts`: 10 import; live `loadBalance` 532–533, 721–722; commented blocks 452–475, 491–493, 504–506, 638–661, 677–679, 690–692
- `src/apis/aiApi.ts:68`, `src/apis/examApi.ts:17` (`newBalance`)
- `src/apis/adminApi.ts`: 1, 22, 41–43 (`proCount`/`vipCount`/`revenue30d`), 91–109, 179–192
- `src/pages/k/ProfilePage.tsx`: 15, 27 (useCan), 28, 33–35, 70–74, 289–310 (wallet card)
- `src/pages/admin/AdminOverviewPage.tsx`: 52, 60, 73–75, 105–114 (Pro/VIP KPIs), 135–143 (revenue chart)
- `src/pages/admin/AdminStatsPage.tsx`: 38, 46, 56–58, 94–102
- `src/components/admin/UserDetailDrawer.tsx`: 23–29, 52–57, 135–176
- Audit labels: `src/components/admin/AuditTable.tsx` 19–21, 39–40, 53–56, 64–65; `src/pages/admin/AdminAuditPage.tsx` 11–14 (decide: keep labels for historical rows)
- Landing: `src/pages/landing/HomePage.tsx` 12, 38; `src/components/organisms/FooterSection.tsx:37` (`/#pricing`); optional `CoralCallout.tsx` 53–82
- PRO badge: `src/components/atoms/ProfileDropdown.tsx` 21, 34; `src/components/organisms/k/SideBar.tsx:33`
- `tsconfig.json:54` (PricingSection entry)
- Optional unreachable upsell/billing UI: `TrendingSidebar.tsx` 63–74, `SettingsSidebar.tsx`, `SettingsTemplate.tsx:145`, `NotificationFilterSidebar.tsx`, `NotificationTemplate.tsx:47`, `NotificationIcon.tsx` 13,26, `NotificationItem.tsx:9`; `currency-vnd` in KpiCard/MiniChartCard/StatChart
- Locales: `public/locales/{en,vi}/admin.json` 5,15–16,27–28,31,34,71–118,187–188,211,259–260,264; `{en,vi,ja}/common.json` 25,51; `{en,vi,ja}/landing.json` `pricing.*` 209–227, 335–340, 362–363 (+ optional `pricingCta.*` 165–171, "no credit card" 230, 311)
- `docs/system/permissions.md` 29–30, 38, 221–222, 225, 278, 303; `docs/generated/route-list.md` 638, 669 (generated)

## Keep
- `src/lib/rbac/api-error-policy.ts` (+ test): `RATE_LIMITED` is a generic parse case
- `src/apis/api.ts:263` `MODEL_INSUFFICIENT_VRAM` is unrelated

## Findings
- No 402/`INSUFFICIENT_BALANCE`/`CHAT_LIMIT_REACHED`/upsell handling in FE; no wallet item in student/teacher sidebar; AI cost labels already commented out.
- Compile breaks after regenerating permissions without `wallet:use`/`subscription:manage`/`finance:admin`: `routes/index.tsx:133,182`, `nav-items.ts:64`, `PricingBand.tsx:85`, `ProfilePage.tsx:33`.
- **FE has NO AI chat page**: `aiChatApi` only used as a type in `ChatHistoryCard`, which nothing imports. Student AI chat = new UI work, not a permission flip.
- `src/types/permissions.generated.ts` must be regenerated via `yarn gen:fe-permissions` in kmaedu-be.
- kmaedu-app (mobile) out of scope.

Estimate: ~56 files (≈63 with optional cleanup).
