# SCR001_HomePage — Screen Spec

**Screen**: SCR001: HomePage
**Type**: atomic
**Route**: `/`
**Generated**: 2026-06-06

## Purpose

Public visitors land on this page, discover what the platform offers, and navigate toward registration or authenticated app entry.

## Screen Layout

Single-page scroll layout with 7 stacked sections (no sticky header). Each section occupies full width with centered content constrained to `max-w-7xl`. Pricing section makes an async API call to fetch subscription plans. Hash-scroll targets (`#features`, `#showcase`) are handled by a `useEffect` on mount (HomePage.tsx:14-21). The page wrapper has `overflow-x-hidden` to prevent horizontal scroll.

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
│ R6: PricingBand (async, id="pricing")   │
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
| R6 | Pricing Band | static | yes | PricingBand, PricingCards | async: Loader2 or error or PricingCards |
| R7 | Coral Callout | static | yes | CoralCallout, SpikeMark | lg:grid-cols-12 split |

## User Flow

### Happy Path

1. User lands on `/` — sees HeroBand with badge, headline, description, two CTAs (Get Started → `/k`, See How It Works → `#showcase`)
2. User scrolls down — TrustStrip (logo strip), FeatureGrid (`#features`), ProductShowcase (`#showcase`), WaysToStudy
3. User scrolls to Pricing Band — PricingBand fetches `GET /payment/subscription/plans`; spinner shows while loading; on success renders PricingCards with monthly/yearly toggle; on error shows error message
4. User reaches CoralCallout at bottom — clicks Register Free → navigates to `/register`
5. User with existing account clicks Get Started → navigates to `/k`

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| pricing API error | `api.get` throws | Error message rendered in R6 instead of PricingCards | `PricingBand.tsx:109-110` |
| pricing API returns empty | `tiers.length === 0` | Pricing section renders nothing (hidden) | `PricingBand.tsx:142` |
| hash present on load | `useLocation().hash` non-empty | `useEffect` scrolls to element with matching `id` after 100ms | `HomePage.tsx:14-21` |

## Data Inventory

N/A — screen displays no dynamic user data (subscription plans are marketing data, not per-user account data).

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `api.get("/payment/subscription/plans")` in-flight | Centered Loader2 spinner, no CTA | none | `PricingBand.tsx:136-139` |
| error | API throws | Error message text (no retry button visible) | none | `PricingBand.tsx:140-141` |
| success | API returns plans | PricingCards rendered with monthly/yearly toggle | toggle pricing period | `PricingBand.tsx:142-148` |
| empty | API returns 0 tiers | Pricing section hidden entirely | none | `PricingBand.tsx:142` |

## Validation & Error Feedback

### A) Client-side

N/A — no client-side form validation detected.

### B) Server-side

N/A — no submit-style action handlers detected on this screen. CTA buttons navigate to other routes.

## Interaction Patterns

- **Clicking "See How It Works" anchor → scrolls to `#showcase` element via smooth scroll** — source: `HomePage.tsx:14-21`
- **Clicking feature card CTA → navigates to `/k/ai-tool` or `/k/manage-exam-room`** — source: `FeatureGrid.tsx:55-61`
- **Clicking way-to-study CTA → navigates to `/k/my-materials`, `/k/manage-exam-room`, `/k/ai-tool`** — source: `WaysToStudy.tsx:46-51`
- **Toggling monthly/yearly in PricingBand → updates `isYearly` state, PricingCards re-renders** — source: `PricingBand.tsx:88,143-146`
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
| `tiers.length === 0` | data-driven | PricingCards | nothing | Pricing section hides entirely when API returns no tiers |
| `loading === true` | data-driven | Loader2 spinner | PricingCards | Spinner replaces pricing content during API fetch |
| `error !== null` | data-driven | error text | PricingCards | Error replaces pricing content on API failure |
| `hash` present on load | responsive | smooth scroll to `#id` | none | `useEffect` reads `useLocation().hash` on mount |

## Component Variants

| Component | Discriminating field | Variants on this screen | Screen-specific props/slots | Cross-ref |
|-----------|---------------------|------------------------|----------------------------|-----------|
| PricingCards | `isYearly` prop | monthly view / yearly view | `tiers`, `isYearly`, `onToggle` | N/A |

## Security Surface

N/A — no auth guards or permission checks detected on this screen.

## Source References

- Page/View: `kmaedu-fe/src/pages/landing/HomePage.tsx:1-34`
- HeroBand component: `kmaedu-fe/src/components/organisms/landing/HeroBand.tsx:1-117`
- TrustStrip component: `kmaedu-fe/src/components/organisms/landing/TrustStrip.tsx:1-24`
- FeatureGrid component: `kmaedu-fe/src/components/organisms/landing/FeatureGrid.tsx:1-67`
- ProductShowcase component: `kmaedu-fe/src/components/organisms/landing/ProductShowcase.tsx:1-106`
- WaysToStudy component: `kmaedu-fe/src/components/organisms/landing/WaysToStudy.tsx:1-58`
- PricingBand component: `kmaedu-fe/src/components/organisms/landing/PricingBand.tsx:1-153`
- CoralCallout component: `kmaedu-fe/src/components/organisms/landing/CoralCallout.tsx:1-87`