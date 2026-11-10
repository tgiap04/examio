# Phase 04: Public Layout And Landing Migration

## Context Links
- `kmaedu-fe/src/routes/layouts/PublicLayout.tsx`
- `kmaedu-fe/src/components/molecules/HeaderSection.tsx`
- `kmaedu-fe/src/components/organisms/FooterSection.tsx`
- `kmaedu-fe/src/components/organisms/HeroSection.tsx`
- `kmaedu-fe/src/components/organisms/FeaturesSectionHome.tsx`
- `kmaedu-fe/src/components/organisms/PricingSection.tsx`
- `ui-design.html`

## Overview
- Priority: High
- Status: Completed
- Apply the warm editorial design language to public shell and landing sections.

## Key Insights
- Public layout is simple: header, children, footer.
- Current footer uses white surface; design reference requires dark navy footer.
- Hero and landing sections use generic gradients and heavier SaaS visuals.

## Requirements
- Cream sticky nav with 64px rhythm and coral CTA.
- Serif display headline, warm body text, 1200px max container.
- Alternate cream, card, dark product mockup, coral callout, dark footer surfaces.
- Keep links/routes unchanged.
- Preserve responsive behavior on mobile.

## Architecture
- Header/footer define public shell identity.
- Landing organisms own content sections and visual pacing.
- Prefer reusing tokenized primitives from Phase 03.

## Related Code Files
- Modify: `PublicLayout.tsx`, `HeaderSection.tsx`, `FooterSection.tsx`
- Modify: landing organisms listed above
- Read: `src/pages/landing/*.tsx`

## Implementation Steps
1. Update public layout background to canvas.
2. Refactor header to cream sticky nav, editorial logo mark, muted nav, coral CTA.
3. Refactor hero to serif headline and dark product/code mockup card.
4. Refactor feature/pricing/feedback sections to cream card, outline card, and dark featured-card patterns.
5. Refactor footer to dark navy surface and on-dark typography.
6. Verify mobile stacking and nav behavior.

## Todo List
- [x] Migrate public header.
- [x] Migrate hero section.
- [x] Migrate feature/pricing/feedback sections.
- [x] Migrate footer.
- [x] Smoke test desktop/mobile public pages.

## Success Criteria
- Landing page visually follows `ui-design.html` rhythm.
- Footer is dark navy, not white.
- No route or tracking behavior changes.

## Risk Assessment
- Landing sections may contain animation/image assumptions that need careful responsive checks.

## Security Considerations
- Keep external links safe and unchanged.

## Next Steps
- Migrate auth flows after public shell style is stable.
