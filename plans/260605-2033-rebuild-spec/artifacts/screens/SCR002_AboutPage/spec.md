# SCR002_AboutPage — Screen Spec

**Screen**: SCR002: AboutPage
**Type**: atomic
**Route**: `/about`
**Generated**: 2026-06-06

## Purpose

Public visitors land on this page to learn about the platform's mission, vision, values, and track record before deciding to register.

## Screen Layout

Single-page scroll with 4 stacked sections, no sticky header. All content driven by i18n translation keys — no async API calls. Background alternates between `bg-canvas` and `bg-canvas landing-dot-paper`. Page wrapper has `overflow-x-hidden` (AboutSection.tsx:36). Sections: hero banner, stats bar, mission/vision grid, values grid, CTA banner.

### Layout Sketch

```
┌─────────────────────────────────────────┐
│ R1: Hero Banner (static)                │
├─────────────────────────────────────────┤
│ R2: Stats Bar (static, border-y)       │
├─────────────────────────────────────────┤
│ R3: Mission/Vision Grid (static)        │
├─────────────────────────────────────────┤
│ R4: Values Grid (static)                │
├─────────────────────────────────────────┤
│ R5: CTA Banner (static)                │
└─────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | Hero Banner | static | yes | Sparkles badge, h1, description | centered, max-w-3xl |
| R2 | Stats Bar | static | yes | 3 stat cards (Calendar, FolderCheck, Smile icons) | md:grid-cols-3 |
| R3 | Mission/Vision | static | yes | 2 article cards (mission + vision) | md:grid-cols-2 |
| R4 | Values Grid | static | yes | 3 value cards (Target, Eye, BookOpen icons) | md:grid-cols-3 |
| R5 | CTA Banner | static | yes | Coral background, h2, p, Register CTA | centered, max-w-2xl |

## User Flow

### Happy Path

1. User navigates to `/about` — sees hero banner with badge, headline, description
2. User scrolls — stats bar (3 key metrics), mission/vision side-by-side cards, 3-column values grid
3. User reaches CTA banner — clicks "Bắt đầu miễn phí" → navigates to `/register`

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| CTA click | Link to `/register` | Navigation to registration | `AboutSection.tsx:148-154` |

N/A — single-action screen, no branches (only CTA navigation).

## Data Inventory

N/A — screen displays no dynamic data (all content from i18n translation keys, no API calls, no bindings/interpolations beyond `t(...)` calls).

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

- **Clicking Register CTA in R5 → navigates to `/register`** — source: `AboutSection.tsx:148-154`
- **Hovering value cards (R4) → border color changes to `border-coral/40`** — source: `AboutSection.tsx:121` (CSS transition on `hover:border-coral/40`)

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | absent | No `aria-label`, `role=`, or `aria-labelledby` on any section |
| Keyboard navigation | not implemented | No `keydown`/`tabindex` on CTA button |
| Focus management | unmanaged | No focus trap or `autofocus` |
| Screen reader compatibility | unknown | No semantic landmarks; CTA button has no accessible label beyond text content |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

N/A — no conditional rendering detected.

## Security Surface

N/A — no auth guards or permission checks detected on this screen.

## Source References

- Page/View: `examio-fe/src/pages/landing/AboutPage.tsx:1-5`
- AboutSection component: `examio-fe/src/components/organisms/AboutSection.tsx:1-161`