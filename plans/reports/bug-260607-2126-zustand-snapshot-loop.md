# Bug — Zustand `useSyncExternalStore` Infinite Loop on Admin Pages

**Date:** 2026-06-07 21:26
**Reporter:** user (`tgiap.dev`)
**Symptom:** `AdminOverviewPage` and `AdminStatsPage` crash with:
> The result of getSnapshot should be cached to avoid an infinite loop
> Maximum update depth exceeded

## Root Cause

```ts
// OLD — broken
function selectSeries(name: string) {
  return (s) => {
    const entry = s.series[name];
    return { data: entry.data, loading: entry.loading, error: entry.error };
  };
}

const signups = useAdminStore(selectSeries("signups"));
```

Zustand v4+/v5 uses `useSyncExternalStore` internally. The contract is
that `getSnapshot` MUST return the same reference for unchanged state.
A selector that returns a fresh object literal each call breaks the
contract:

1. Component mounts → selector returns object literal A.
2. React stores A as the snapshot.
3. Re-render (e.g. from another store update) → selector returns object
   literal B (same contents, different reference).
4. `Object.is(A, B) === false` → React thinks state changed → schedules
   re-render → back to step 3.
5. React aborts after the depth limit → "Maximum update depth exceeded".

Two separate issues compound:
- The inner object literal breaks the snapshot cache.
- `selectSeries("signups")` is re-invoked every render, creating a new
  selector function each time (less critical but still wasteful).

## Fix

Select the **stored entry reference** directly. Zustand only mutates
`s.series[name]` when state actually changes (via spread), so the
reference is stable for unchanged state.

```ts
// NEW — stable
const EMPTY_SERIES = { data: null, loading: false, error: null, lastFetched: null } as const;

const signups = useAdminStore((s) => s.series.signups ?? EMPTY_SERIES);
```

The `?? EMPTY_SERIES` fallback returns a frozen module-level constant
when the key hasn't been created yet — same reference on every render,
no infinite loop.

## Files

- `examio-fe/src/pages/admin/AdminOverviewPage.tsx` — replaced
  `selectSeries` with inline selectors that read stable references.
- `examio-fe/src/pages/admin/AdminStatsPage.tsx` — same fix.

## Out of Scope (separate issue)

`GET /api/v1/admin/overview` returns `503 Service Unavailable` because
`admin-service` is not running locally (port 7006 has no listener).
This is a separate problem from the React loop; even after the loop
is fixed, the admin pages will show empty/error state until
`yarn dev:admin` is started (or `docker compose up admin` in deploy).

## Status

- ✅ React loop fixed in `AdminOverviewPage`
- ✅ React loop fixed in `AdminStatsPage`
- ⚠️ `admin-service` not running — start it to see real data
