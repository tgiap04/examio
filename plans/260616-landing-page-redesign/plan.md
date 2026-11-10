# Landing Page Redesign — Optimus-Inspired Layout

## Overview

Redesign the KMAEdu home/landing page to match the **layout, structure, and component patterns** of the Optimus reference site, while keeping KMAEdu's **design system** (Anthropic-inspired terracotta palette, cream canvas, grotesk typography).

**Reference:** Optimus site copied to `plans/optimus-reference/optimus-the-ai-platform-to-build-and-ship/`
**Current landing:** `kmaedu-fe/src/pages/landing/HomePage.tsx` + 7 organisms

## Key Design Decisions

| Aspect | Optimus | KMAEdu (new) |
|--------|---------|-------------|
| Background | Light (no dark mode) | Cream canvas #faf9f7, no dark mode |
| Primary color | Dark navy foreground | Terracotta #c2522d |
| Display font | Instrument Serif | Inter (Styrene A/B substitute), weight 500, -0.03em |
| Body font | Instrument Sans | Inter, 17px / 1.65 |
| Nav style | Floating pill on scroll | Same floating pill pattern, cream bg |
| Max width | 1400px | 1400px (was 1200px) |
| Sections | 13 sections | 13 sections matching Optimus layout |
| Animations | IntersectionObserver fade-in | Same pattern with prefers-reduced-motion |
| Border radius | 24px nav pill, sharp cards | Match |
| Marquee | Stats + integrations + testimonials | Same pattern for trust/logos |

## Optimus → KMAEdu Section Mapping

| # | Optimus Section | KMAEdu Section | Status |
|---|----------------|----------------|--------|
| 1 | Navigation | HeaderSection (floating pill) | Redesign |
| 2 | HeroSection | HeroBand | Redesign |
| 3 | FeaturesSection (4 numbered features) | **NEW** FeatureShowcase | Create |
| 4 | HowItWorksSection (dark, 3 steps + code) | ProductShowcase | Redesign to match |
| 5 | InfrastructureSection (2-col stats) | **NEW** StatsSection | Create |
| 6 | MetricsSection (animated counters) | **NEW** MetricsSection | Create |
| 7 | IntegrationsSection (marquee grid) | TrustStrip → IntegrationsMarquee | Redesign |
| 8 | SecuritySection (2-col) | **NEW** SecuritySection | Create |
| 9 | DevelopersSection (code tabs) | WaysToStudy (adapt pattern) | Redesign |
| 10 | TestimonialsSection (rotating quotes) | **NEW** TestimonialsSection | Create |
| 11 | PricingSection (3-tier grid) | PricingBand | Redesign |
| 12 | CtaSection (spotlight card) | CoralCallout | Redesign |
| 13 | FooterSection | FooterSection | Redesign |

## Implementation Plan

### Phase 1: Foundation (CSS + Theme)
- [ ] Update `globals.css` CSS variables to match DESIGN.md (terracotta #c2522d, canvas #faf9f7, etc.)
- [ ] Remove dark mode toggle from landing page header
- [ ] Update Tailwind theme tokens
- [ ] Add new CSS utilities: `marquee`, `marquee-reverse`, `animate-char-in`, `noise-overlay`

### Phase 2: Navigation Redesign
- [ ] Update `HeaderSection.tsx` — floating pill nav that collapses on scroll (Optimus pattern)
- [ ] Full-screen mobile menu overlay
- [ ] Remove theme toggle from landing nav
- [ ] Add KMAEdu branding

### Phase 3: Hero Section Redesign
- [ ] Rewrite `HeroBand.tsx` — giant headline with rotating words, stat marquee at bottom
- [ ] Add subtle grid lines background
- [ ] IntersectionObserver fade-in animations

### Phase 4: New Sections (Feature Showcase)
- [ ] Create `FeatureShowcase.tsx` — 4 numbered features with SVG visuals (Optimus pattern)
- [ ] Each feature: number + title + description + animated SVG visual
- [ ] IntersectionObserver reveal

### Phase 5: How It Works (Product Showcase Redesign)
- [ ] Rewrite `ProductShowcase.tsx` — dark section with 3 steps + code window
- [ ] Interactive step selection with auto-advance
- [ ] Code character-by-character reveal animation

### Phase 6: Infrastructure + Stats
- [ ] Create `StatsSection.tsx` — 2-col: content left, location/data list right
- [ ] Create `MetricsSection.tsx` — animated counters in 2x2 grid

### Phase 7: Integrations Marquee
- [ ] Redesign `TrustStrip.tsx` → `IntegrationsMarquee.tsx`
- [ ] Two-directional marquee with integration cards
- [ ] Header with centered eyebrow text

### Phase 8: Security Section
- [ ] Create `SecuritySection.tsx` — 2-col: content left, feature cards right
- [ ] Certification badges
- [ ] Icon + title + description cards

### Phase 9: Developers / Study Methods
- [ ] Redesign `WaysToStudy.tsx` — code tab panel with 3 code examples
- [ ] Install / Initialize / Deploy tabs → Upload / Quiz / Flashcard tabs
- [ ] Copy button, character-by-character reveal

### Phase 10: Testimonials
- [ ] Create `TestimonialsSection.tsx` — rotating quotes with auto-advance
- [ ] Metric highlight card per testimonial
- [ ] Company logo marquee at bottom

### Phase 11: Pricing Redesign
- [ ] Rewrite `PricingBand.tsx` — 3-column grid with gap-px borders
- [ ] Monthly/Annual toggle
- [ ] "Most Popular" badge on middle tier

### Phase 12: CTA + Footer Redesign
- [ ] Rewrite `CoralCallout.tsx` — bordered card with spotlight mouse effect
- [ ] Decorative corner borders
- [ ] Rewrite `FooterSection.tsx` — 6-column grid (brand + 4 link groups + social)
- [ ] Bottom bar with copyright + system status

### Phase 13: Integration + Testing
- [ ] Update `HomePage.tsx` to compose all new sections
- [ ] Add i18n keys for new sections (vi, en, ja)
- [ ] Visual validation with reviewer agent

## Files to Modify

### Core
- `kmaedu-fe/src/pages/landing/HomePage.tsx`
- `kmaedu-fe/src/app/globals.css` (CSS variables)
- `kmaedu-fe/tailwind.config.ts`

### Landing Sections (modify)
- `kmaedu-fe/src/components/molecules/HeaderSection.tsx`
- `kmaedu-fe/src/components/organisms/landing/HeroBand.tsx`
- `kmaedu-fe/src/components/organisms/landing/ProductShowcase.tsx`
- `kmaedu-fe/src/components/organisms/landing/WaysToStudy.tsx`
- `kmaedu-fe/src/components/organisms/landing/PricingBand.tsx`
- `kmaedu-fe/src/components/organisms/landing/CoralCallout.tsx`
- `kmaedu-fe/src/components/organisms/landing/TrustStrip.tsx`
- `kmaedu-fe/src/components/organisms/FooterSection.tsx`

### Landing Sections (create)
- `kmaedu-fe/src/components/organisms/landing/FeatureShowcase.tsx`
- `kmaedu-fe/src/components/organisms/landing/StatsSection.tsx`
- `kmaedu-fe/src/components/organisms/landing/MetricsSection.tsx`
- `kmaedu-fe/src/components/organisms/landing/SecuritySection.tsx`
- `kmaedu-fe/src/components/organisms/landing/TestimonialsSection.tsx`

### i18n
- `kmaedu-fe/public/locales/vi/landing.json`
- `kmaedu-fe/public/locales/en/landing.json`
- `kmaedu-fe/public/locales/ja/landing.json`

## Success Criteria

1. Landing page layout matches Optimus structure (13 sections, same order)
2. Design system colors/typography from DESIGN.md applied consistently
3. All sections have IntersectionObserver fade-in animations
4. Nav floats as pill on scroll, collapses on mobile
5. Marquee animations for trust logos / integrations / testimonials
6. Code window with character-by-character reveal
7. Animated counters in metrics section
8. No dark mode on landing page
9. All i18n keys present in vi/en/ja
10. `yarn build` passes without errors

## Risks

- Large scope (13 sections) — may need to split into multiple phases
- New i18n keys needed for ~6 new sections
- SVG animated visuals in FeatureShowcase need custom work
- Marquee CSS animations need careful cross-browser testing
