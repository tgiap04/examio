# SCR006: CookiesPage — Screen Spec

**Screen**: SCR006: CookiesPage
**Type**: atomic
**Route**: `/cookies`
**Generated**: 2026-06-06

## Purpose

A static legal page that informs visitors about examio's cookie usage policy. Users reach it from the public footer when they want to understand what tracking technologies the platform uses. Fully static, no async operations.

## Screen Layout

Single-column legal page wrapped in the shared `LegalPageShell` (same as TermsPage/PrivacyPage/SecurityPage). Centered max-width content area with a top section badge + heading, followed by 6 numbered body sections rendered from a static i18n map.

### Layout Sketch

```
┌─────────────────────────────────────────┐
│  R1: HeaderSection (sticky)             │
├─────────────────────────────────────────┤
│  R2: LegalPageShell (max-w-4xl mx-auto) │
│  ┌─ Badge ────────────────────────────┐ │
│  ├─ Section 1: What are cookies?       │ │
│  ├─ Section 2: How we use cookies      │ │
│  ├─ Section 3: Managing cookies        │ │
│  ├─ Section 4: Third-party cookies     │ │
│  ├─ Section 5: Updates to policy       │ │
│  └─ Section 6: Contact                 │ │
└─────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | HeaderSection | sticky-top | no | HeaderSection | hamburger-sm, full-md+ |
| R2 | LegalPageShell | static | yes | LegalPageShell, Badge | fluid max-w-4xl |

## User Flow

### Happy Path

1. User scrolls page top→bottom reading each section
2. User clicks "Back to Home" CTA at section 6 → navigate to `/`

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| Navigate away | User clicks header logo or any nav link | Route changes via React Router | `examio-fe/src/components/molecules/HeaderSection.tsx:42` |

`N/A — single-action screen, no branches.`

## Data Inventory

`N/A — screen displays no dynamic data (static marketing/legal page).`

## UI States

`N/A — no async ops.`

## Validation & Error Feedback

`N/A — no client-side form validation detected.`
`N/A — no submit-style action handlers detected.`

## Interaction Patterns

- **Clicking "Back to Home" navigates to `/`** — source: `examio-fe/src/components/molecules/HeaderSection.tsx:42`

`N/A — no non-trivial interaction patterns detected (only standard navigation links).`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | absent | No aria-label on shell or sections |
| Keyboard navigation | supported | Standard tab + Enter for links |
| Focus management | unmanaged | No skip-to-content link |
| Screen reader compatibility | unknown | Headings use semantic `<h1>`/`<h2>` |

`[NO_A11Y_DETECTED] — accessibility audit needed before production release.`

## Conditional Rendering

`N/A — no conditional rendering detected.`

## Security Surface

`N/A — no auth guards or permission checks detected on this screen.`

## Source References

- Page/View: `examio-fe/src/pages/landing/CookiesPage.tsx:1`
- Shell: `examio-fe/src/components/organisms/landing/LegalPageShell.tsx:1`
- Header: `examio-fe/src/components/molecules/HeaderSection.tsx:42`
- Footer (with link target): `examio-fe/src/components/organisms/FooterSection.tsx:1`
