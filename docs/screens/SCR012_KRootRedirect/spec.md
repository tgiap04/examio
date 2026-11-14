# SCR012: KRootRedirect — Screen Spec

**Screen**: SCR012: KRootRedirect
**Type**: atomic
**Route**: `/k`
**Generated**: 2026-06-06

## Purpose

Authenticated users who navigate to the root of the protected `/k` section are immediately routed to the AI tool dashboard (`/k/ai-tool`). Unauthenticated users are sent to `/login` instead. This screen has no visible UI of its own — it is a pure routing decision rendered inside the `KLayout` shell.

## Screen Layout

This screen renders inside `KLayout` (persistent sidebar nav + topbar) but contributes only a minimal centered loading placeholder while the redirect decision resolves. There is no dedicated content region — the component returns a full-viewport flex container with a "Loading..." text node. The layout root is `KRootRedirect.tsx:22` (`.flex.flex-1.flex-col` inside the KLayout outlet).

### Layout Sketch

```
┌─────────────────────────────────────────────────────┐
│ R1: KLayout shell (persistent)                     │
│  ┌───────────┬────────────────────────────────────┐│
│  │ R1a:     │ R1b: KLayout content outlet         ││
│  │ Sidebar  │  ┌────────────────────────────────┐ ││
│  │ (nav)    │  │ R2: KRootRedirect content      │ ││
│  │          │  │ (loading placeholder, no nav)  │ ││
│  │          │  └────────────────────────────────┘ ││
│  └───────────┴────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | KLayout shell | static | no | `KLayout` wrapper (sidebar nav, topbar) | hidden-md breakpoint collapse (managed by KLayout) |
| R2 | Redirect content | static | no | `div` with "Loading..." text | minimal placeholder, auto-replaced |

Note: R1 is the parent shell; R2 is this screen's own contribution — a loading indicator that is immediately replaced by the target route.

## User Flow

### Happy Path

1. User navigates to `/k`.
2. `KRootRedirect` mounts inside `KLayout`. `useEffect` at `KRootRedirect.tsx:9` runs.
3. `useAuthStore` is checked: `initializing` is `true` during store hydration from localStorage — the effect returns early (`if (initializing) return`).
4. Once auth store finishes initializing: `isAuthenticated` is `true` → `navigate("/k/ai-tool", { replace: true })` fires.
5. React Router replaces the current history entry; `/k/ai-tool` renders within the same `KLayout` outlet.

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| `initializing === true` | Auth store still hydrating | `useEffect` returns early; no navigation yet; "Loading..." text shown | `KRootRedirect.tsx:10` |
| Not authenticated | `isAuthenticated === false` after init | `navigate("/login", { replace: true })` — sends user to login | `KRootRedirect.tsx:14` |
| Authenticated | `isAuthenticated === true` after init | `navigate("/k/ai-tool", { replace: true })` — AI tool dashboard | `KRootRedirect.tsx:19` |

## Data Inventory

N/A — screen displays no dynamic data, only a static "Loading..." text string.

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| initializing | Auth store `initializing === true` | "Loading..." text displayed in centered flex container | none (wait) | `KRootRedirect.tsx:24` |
| redirecting | `isAuthenticated` resolves to `true` | Immediate `replace` navigation to `/k/ai-tool`; no visible state change | none | `KRootRedirect.tsx:19` |
| unauthenticated | `isAuthenticated === false` after init | Immediate `replace` navigation to `/login`; no visible state change | none | `KRootRedirect.tsx:15` |

## Validation & Error Feedback

N/A — no form inputs, no async API calls in this component.

## Interaction Patterns

- **Redirect decision is reactive** — `useEffect` dependency array `[initializing, isAuthenticated, navigate]` ensures re-run whenever auth state changes; uses `replace: true` to avoid polluting browser history with the intermediate `/k` entry — source: `KRootRedirect.tsx:9,19`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | absent | No ARIA attributes on the placeholder `div` |
| Keyboard navigation | not applicable | No interactive elements |
| Focus management | not applicable | No focus management needed; immediate navigation |
| Screen reader compatibility | unknown | "Loading..." text may be announced as content; `[UNVERIFIED] screen reader announcement of redirect` |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `initializing === true` | auth | "Loading..." placeholder text | none | Prevents flash of wrong redirect target |
| `isAuthenticated === false` | auth | Redirect to `/login` | none | `ProtectedRoute` also guards this route, but component-level check handles the case where guard passed before store fully initialized |

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `ProtectedRoute` wrapper | auth | Unauthenticated users are redirected to `/login` before `KRootRedirect` ever renders; `[UNVERIFIED] server enforcement` — static analysis cannot confirm backend session validation on `/k/ai-tool` after redirect |
| Component-level `!isAuthenticated` check | auth | Belt-and-suspenders: if `ProtectedRoute` guard somehow passes while user is not yet authenticated, component redirects to `/login` |

## Source References

- Page/View: `kmaedu-fe/src/pages/k/KRootRedirect.tsx:1`
- Auth store: `kmaedu-fe/src/stores/useAuthStore.ts:1`
- Route guard: `kmaedu-fe/src/routes/guards/ProtectedRoute.tsx:1`
- Router config: `kmaedu-fe/src/routes/index.tsx:152`