# SCR015_SubscriptionPage — Screen Spec

**Screen**: SCR015: SubscriptionPage
**Type**: atomic
**Route**: `/k/subscription`
**Generated**: 2026-06-06

## Purpose

Authenticated users view their current wallet credit balance, total transaction count, and a paginated history of wallet transactions. They navigate between pages of transaction history to track credit purchases, subscription renewals, and service usage charges.

---

## Screen Layout

The page uses a single-column stacked layout with a full-width header and two summary cards (2-column grid on `md+`) above a full-width transaction list card. All cards have rounded corners, a white background, and a subtle border. No sidebar or tab bar is present. The page has fixed bottom padding (`pb-20`) for mobile safe area. (source: `SubscriptionPage.tsx:44`)

### Layout Sketch

```
┌─────────────────────────────────────────────────────┐
│  R1: Page Header — title + subtitle                 │
├──────────────────────┬──────────────────────────────┤
│ R2: Balance Card     │ R3: Total Transactions Card  │
│ (2-col grid on md)  │ (2-col grid on md)           │
├──────────────────────┴──────────────────────────────┤
│ R4: Transaction History Card                         │
│   Header: "Lịch sử giao dịch" + page number         │
│   List: transaction rows                            │
│   Pagination: Prev / Next buttons                    │
└─────────────────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | Page Header | static | no | Title + subtitle | Always visible, fluid |
| R2 | Balance Card | static | no | `walletDetails.balance` display | `md:grid-cols-2` shared grid with R3 |
| R3 | Transaction Count Card | static | no | `walletDetails.transactions.data.length` | `md:grid-cols-2` shared grid with R2 |
| R4 | Transaction History Card | static | yes | Transaction rows, pagination buttons | Full width, `overflow-y-auto` if needed |

---

## User Flow

### Happy Path

1. User lands on `/k/subscription`; `useEffect` calls `fetchData(1)`; `storeCache.fetchWithCache` wraps `getWalletDetailsApi(page, PAGE_SIZE)` with 5-minute TTL; `walletDetails` state populated; loading spinner shown until resolved. R1–R4
2. Two summary cards render: balance shows `walletDetails.balance.toLocaleString("vi-VN") + " credits"`; transaction count shows total items in current page. R2, R3
3. Transaction history card renders header with current page number; list maps `walletDetails.transactions.data`; each row shows `transaction.type`, `transaction.createdAt`, and `transaction.amount`. R4
4. User clicks "Trang sau" (Next); `handlePageChange(page + 1)` updates `currentPage`; `useEffect` re-fires `fetchData` with new page; list re-renders with new page data. R4: pagination
5. User clicks "Trang trước" (Prev); `handlePageChange(Math.max(1, currentPage - 1))` — disabled when `currentPage === 1`. R4: pagination

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| `isLoading` or `!walletDetails` on initial render | `isLoading === true` | Full-page centered spinner; no content rendered | `SubscriptionPage.tsx:35` |
| `getWalletDetailsApi` throws | API rejects | `console.error`; spinner remains (no error UI shown) | `SubscriptionPage.tsx:21` |
| `currentPage === 1` | pagination state | "Trang trước" button disabled | `SubscriptionPage.tsx:82` |
| `walletDetails.transactions.data.length < PAGE_SIZE` | last page of results | "Trang sau" button disabled | `SubscriptionPage.tsx:89` |
| `walletDetails.transactions.data` is empty | API returns 0 results | Empty list rendered (no explicit empty state component) | `SubscriptionPage.tsx:68` |

---

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| `walletDetails.balance` | Số dư hiện tại | API field | integer + " credits" suffix, `toLocaleString("vi-VN")` | `0` shown | MODEL-027.balance |
| `walletDetails.transactions.data[].type` | Loại giao dịch | API field | raw string | — | MODEL-028.type |
| `walletDetails.transactions.data[].createdAt` | Thời gian | API field | `toLocaleString()` default format | — | MODEL-028.createdAt |
| `walletDetails.transactions.data[].amount` | Số tiền | API field | integer with `toLocaleString("vi-VN")` | — | MODEL-028.amount |
| `walletDetails.transactions.data.length` | Tổng giao dịch | API field | integer count of current page items | `0` | N/A |
| `currentPage` | Trang | local state | integer (1-indexed) | `1` | N/A |

---

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `getWalletDetailsApi` in-flight | Full-page spinner (min-h-[400px]) | none | `SubscriptionPage.tsx:37` |
| error | `getWalletDetailsApi` throws | `console.error`; spinner remains; no error UI | none | `SubscriptionPage.tsx:21` |
| empty | `walletDetails.transactions.data.length === 0` | Transaction list area renders empty (no explicit empty state component) | none | `SubscriptionPage.tsx:68` |
| first-page | `currentPage === 1` | "Trang trước" button disabled | none | `SubscriptionPage.tsx:82` |
| last-page | `walletDetails.transactions.data.length < PAGE_SIZE` | "Trang sau" button disabled | none | `SubscriptionPage.tsx:89` |

---

## Validation & Error Feedback

### A) Client-side

N/A — no client-side form validation detected.

### B) Server-side

#### Get wallet details
- **Endpoint:** `GET /wallet/details?page={page}&size={PAGE_SIZE}`
- **Request:** `{ page: number, size: number }` via query params
- **Success:** `200` → `WalletDetails` object → `setWalletDetails(data)` → loading spinner replaced with content
- **Errors:** `[UNVERIFIED]` — `console.error` only; no user-visible error state rendered
- **Trigger:** Page mount and `currentPage` state change
- **Source:** `SubscriptionPage.tsx:14`

---

## Interaction Patterns

- **Cache-first fetch** — `storeCache.fetchWithCache` checks Zustand cache before hitting API; cache key includes `{ page, size }`; 5-minute TTL — source: `SubscriptionPage.tsx:14`
- **Pagination via state** — `currentPage` state drives `useEffect` dependency array; page change triggers `fetchData` re-run — source: `SubscriptionPage.tsx:29`
- **Disabled Prev on first page** — `Math.max(1, currentPage - 1)` prevents page < 1; button disabled when `currentPage === 1` — source: `SubscriptionPage.tsx:81`
- **Disabled Next on last page** — server returns fewer than `PAGE_SIZE` items when last page reached; button disabled accordingly — source: `SubscriptionPage.tsx:89`

---

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | absent | No `aria-label` on transaction rows; no `aria-live` on pagination; no `role` on cards |
| Keyboard navigation | supported | Standard tab order through pagination buttons |
| Focus management | unmanaged | No focus management on page change or data load |
| Screen reader compatibility | unknown | Transaction list has no semantic `<table>`; no `<caption>` or `aria-describedby` |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

---

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `isLoading || !walletDetails` | auth | Full-page spinner | all content cards | |
| `currentPage === 1` | responsive | "Trang trước" button disabled | — | |
| `walletDetails.transactions.data.length < PAGE_SIZE` | responsive | "Trang sau" button disabled | — | |

---

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `ProtectedRoute` on `/k/subscription` | auth | Redirect to `/login` if not authenticated |
| Server returns only own wallet data (`userId` from auth token) | auth | Cannot access other users' wallet/transactions — server-enforced [UNVERIFIED] |

---

## Source References

- Page/View: `kmaedu-fe/src/pages/k/SubscriptionPage.tsx:1`
- Subscription API: `kmaedu-fe/src/apis/subscriptionApi.ts:1`
- Store cache: `kmaedu-fe/src/lib/storeCache.ts` (referenced via `storeCache.fetchWithCache`)
