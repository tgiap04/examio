# SCR001_HomePage — Screen Spec

**Screen**: SCR001: HomePage
**Type**: atomic
**Route**: `/`
**Generated**: 2026-06-06

## Purpose

Public visitors land on this page, discover what the platform offers, and navigate toward registration or authenticated app entry.

## Screen Layout

Single-page scroll layout with 6 stacked sections (no sticky header). Each section occupies full width with centered content constrained to `max-w-7xl`. Hash-scroll targets (`#features`, `#showcase`) are handled by a `useEffect` on mount (HomePage.tsx:14-21). The page wrapper has `overflow-x-hidden` to prevent horizontal scroll.

### Layout Sketch

```
┌─────────────────────────────────────────┐
│ R1: HeroBand (static)                   │
├─────────────────────────────────────────┤
│ R2: TrustStrip (static)                 │
├─────────────────────────────────────────┤
│ R3: FeatureGrid (static, id="features") │
├─────────────────────────────────────────┤
│ R4: ProductShowcase (static, id="showcase") │
├─────────────────────────────────────────┤
│ R5: WaysToStudy (static)                │
├─────────────────────────────────────────┤
│ R7: CoralCallout (static)               │
└─────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | Hero Band | static | yes | HeroBand, HeroMockup | fluid, cols collapse to 1 on sm |
| R2 | Trust Strip | static | yes | TrustStrip | centered flex-wrap |
| R3 | Feature Grid | static | yes | FeatureGrid | md:grid-cols-3 |
| R4 | Product Showcase | static | yes | ProductShowcase, ShowcaseTerminal | lg:grid-cols-12 split |
| R5 | Ways to Study | static | yes | WaysToStudy | md:grid-cols-3 |
| R7 | Coral Callout | static | yes | CoralCallout, SpikeMark | lg:grid-cols-12 split |

## User Flow

### Happy Path

1. User lands on `/` — sees HeroBand with badge, headline, description, two CTAs (Get Started → `/k`, See How It Works → `#showcase`)
2. User scrolls down — TrustStrip (logo strip), FeatureGrid (`#features`), ProductShowcase (`#showcase`), WaysToStudy
3. User reaches CoralCallout at bottom — clicks Register Free → navigates to `/register`
4. User with existing account clicks Get Started → navigates to `/k`

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| hash present on load | `useLocation().hash` non-empty | `useEffect` scrolls to element with matching `id` after 100ms | `HomePage.tsx:14-21` |

## Data Inventory

N/A — screen displays no dynamic user data.

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| (none) | static page | No async states: every section is static content | none | `HomePage.tsx` |

## Validation & Error Feedback

### A) Client-side

N/A — no client-side form validation detected.

### B) Server-side

N/A — no submit-style action handlers detected on this screen. CTA buttons navigate to other routes.

## Interaction Patterns

- **Clicking "See How It Works" anchor → scrolls to `#showcase` element via smooth scroll** — source: `HomePage.tsx:14-21`
- **Clicking feature card CTA → navigates to `/k/ai-tool` or `/k/manage-exam-room`** — source: `FeatureGrid.tsx:55-61`
- **Clicking way-to-study CTA → navigates to `/k/my-materials`, `/k/manage-exam-room`, `/k/ai-tool`** — source: `WaysToStudy.tsx:46-51`
- **Submitting contact form → no API call; shows submitted message for 3s then clears** — source: `ContactSection.tsx:25-30` *(ContactPage delegates to ContactSection; interaction noted here for cross-reference)*

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | absent | No `aria-label`, `role=`, or `aria-labelledby` on any section component |
| Keyboard navigation | not implemented | No `keydown`/`tabindex` handlers on CTA buttons or interactive cards |
| Focus management | unmanaged | No focus trap, no `autofocus`, no scroll-to-element on keyboard nav |
| Screen reader compatibility | unknown | No semantic landmarks (`role="main"`, `role="banner"`), no `<label>` linkage on nav CTAs |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `hash` present on load | responsive | smooth scroll to `#id` | none | `useEffect` reads `useLocation().hash` on mount |

## Component Variants

None on this screen.

## Security Surface

N/A — no auth guards or permission checks detected on this screen.

## Source References

- Page/View: `examio-fe/src/pages/landing/HomePage.tsx:1-34`
- HeroBand component: `examio-fe/src/components/organisms/landing/HeroBand.tsx:1-117`
- TrustStrip component: `examio-fe/src/components/organisms/landing/TrustStrip.tsx:1-24`
- FeatureGrid component: `examio-fe/src/components/organisms/landing/FeatureGrid.tsx:1-67`
- ProductShowcase component: `examio-fe/src/components/organisms/landing/ProductShowcase.tsx:1-106`
- WaysToStudy component: `examio-fe/src/components/organisms/landing/WaysToStudy.tsx:1-58`
- CoralCallout component: `examio-fe/src/components/organisms/landing/CoralCallout.tsx:1-87`