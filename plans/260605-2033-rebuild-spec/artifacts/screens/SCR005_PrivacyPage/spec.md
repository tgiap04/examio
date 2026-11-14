# SCR005_PrivacyPage — Screen Spec

**Screen**: SCR005: PrivacyPage
**Type**: atomic
**Route**: `/privacy`
**Generated**: 2026-06-06

## Purpose

Public visitors and registered users read the platform's Privacy Policy to understand how their personal data is collected, used, and protected.

## Screen Layout

Single-page layout with two stacked regions: a header section (eyebrow + title + last updated) and a prose content section. Uses `LegalPageShell` as the sole layout wrapper. Content section constrained to `max-w-3xl`. All content from i18n — no async API calls. Background: `bg-canvas landing-dot-paper` for header, `bg-canvas` for content. Identical layout structure to TermsPage (SCR004) — same shell component used.

### Layout Sketch

```
┌─────────────────────────────────────────┐
│ R1: Page Header (static)                │
├─────────────────────────────────────────┤
│ R2: Legal Content (static, scrollable)  │
│   (6 sections rendered from i18n map)  │
└─────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | Page Header | static | yes | eyebrow badge, h1 title, last updated date | centered, max-w-3xl |
| R2 | Legal Content | static | yes | 6 `<Section>` components from map, each with h2 + body paragraph | centered, max-w-3xl, prose-legal class |

## User Flow

### Happy Path

1. User navigates to `/privacy` — sees header with eyebrow "Chính sách", title, last updated date
2. User scrolls — sees 6 legal sections (s1–s6), each with a localized heading and body paragraph
3. No further interaction — purely informational

### Branches

N/A — single-action screen, no branches.

## Data Inventory

N/A — screen displays no dynamic data. All content rendered from i18n translation keys (`t("privacy.sN.title")`, `t("privacy.sN.body")` for N=1..6). No bindings, no API calls, no computed values.

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| N/A | none | all content static, no async ops | N/A | N/A |

N/A — no async ops.

## Validation & Error Feedback

### A) Client-side

N/A — no client-side form validation detected.

### B) Server-side

N/A — no submit-style action handlers detected.

## Interaction Patterns

N/A — no non-trivial interaction patterns detected (only standard form input bindings).

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | absent | No `aria-label`, `role=`, or `aria-labelledby` on shell or section components |
| Keyboard navigation | not implemented | No `keydown`/`tabindex` handlers |
| Focus management | unmanaged | No `autofocus`, no focus management |
| Screen reader compatibility | unknown | Section headings use `h2` (semantic); no landmark roles |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

N/A — no conditional rendering detected. The `SECTIONS` array is a static constant (`["s1", "s2", "s3", "s4", "s5", "s6"]`).

## Security Surface

N/A — no auth guards or permission checks detected on this screen.

## Source References

- Page/View: `kmaedu-fe/src/pages/landing/PrivacyPage.tsx:1-33`
- LegalPageShell component: `kmaedu-fe/src/components/organisms/landing/LegalPageShell.tsx:1-46`