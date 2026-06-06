# SCR007: SecurityPage — Screen Spec

**Screen**: SCR007: SecurityPage
**Type**: atomic
**Route**: `/security`
**Generated**: 2026-06-06

## Purpose

A static legal page that explains examio's security practices (encryption, auth, data handling). Users reach it from the public footer when they want to understand how their data is protected. Fully static, no async operations.

## Screen Layout

Identical to SCR006 (CookiesPage): single-column legal page wrapped in the shared `LegalPageShell`. Centered max-width content area with badge + heading, 6 numbered sections rendered from a static i18n map.

### Layout Sketch

```
┌─────────────────────────────────────────┐
│  R1: HeaderSection (sticky)             │
├─────────────────────────────────────────┤
│  R2: LegalPageShell (max-w-4xl mx-auto) │
│  ┌─ Badge ────────────────────────────┐ │
│  ├─ Section 1: Data encryption          │ │
│  ├─ Section 2: Authentication          │ │
│  ├─ Section 3: Session management      │ │
│  ├─ Section 4: Data storage            │ │
│  ├─ Section 5: Bug bounty              │ │
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

`N/A — no non-trivial interaction patterns detected.`

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

- Page/View: `examio-fe/src/pages/landing/SecurityPage.tsx:1`
- Shell: `examio-fe/src/components/organisms/landing/LegalPageShell.tsx:1`
- Header: `examio-fe/src/components/molecules/HeaderSection.tsx:42`
