---
title: "Phase 03: i18n PublicLayout Pages"
description: "Replace hardcoded Vietnamese strings with t() calls in HeaderSection, FooterSection, and all landing page organisms"
status: completed
priority: P1
effort: 2h
tags: [i18n, landing, header, footer, public-layout]
---

# Phase 03: i18n PublicLayout Pages

## Context Links

- [plan.md](./plan.md) — overview
- [phase-01](./phase-01-install-config.md) — i18n config (must complete first)
- [phase-02](./phase-02-translation-files.md) — locale JSON files (must complete first)

## Overview

Replace all hardcoded Vietnamese strings in HeaderSection, FooterSection, and the 7 homepage section components with `useTranslation` hook calls. This covers the entire PublicLayout surface area.

**Priority:** P1
**Status:** completed

## Key Insights

- HeaderSection already has locale state management via `examio.locale` — replace with `i18n.changeLanguage()` which auto-persists via LanguageDetector
- FooterSection has `linkGroups` array defined at module scope with hardcoded strings — must convert to a function/component that reads translations
- Landing page organisms (HeroBand, FeatureGrid, etc.) define data arrays at module scope with hardcoded strings — same pattern: convert to use `t()` inside the component
- PricingBand: tier names/descriptions/CTAs come from API with locale-aware fields (e.g., `nameVi`, `descriptionVi`). Only static UI strings (badge, headline, toggle labels, popular badge, free label, period labels, error message) go to locale files.
- The `locales` array in HeaderSection (`vi`, `en`) will be expanded to include `ja` via the LanguageSwitcher in Phase 05

## Requirements

### Functional
- All visible text in HeaderSection, FooterSection, and landing organisms uses `t()` calls
- Language switch in HeaderSection triggers instant text update across all visible components
- No layout shift or visual regression
- `aria-label` attributes also translated

### Non-functional
- Each component file stays under 200 lines
- No new components created (exception: data arrays moved inline or converted to hooks)
- `useTranslation('common')` for shared components, `useTranslation('landing')` for landing sections

## Architecture

### Data Flow
```
User clicks language in HeaderSection
  → i18n.changeLanguage('en')
    → LanguageDetector persists 'en' to localStorage('examio-i18next.locale')
      → All useTranslation() subscribers re-render
        → Text updates instantly
```

## Related Code Files

### Files to Modify
- `examio-fe/src/components/molecules/HeaderSection.tsx` (~15 strings)
- `examio-fe/src/components/organisms/FooterSection.tsx` (~25 strings)
- `examio-fe/src/components/organisms/landing/HeroBand.tsx` (~6 strings)
- `examio-fe/src/components/organisms/landing/TrustStrip.tsx` (~4 strings)
- `examio-fe/src/components/organisms/landing/FeatureGrid.tsx` (~10 strings)
- `examio-fe/src/components/organisms/landing/ProductShowcase.tsx` (~8 strings)
- `examio-fe/src/components/organisms/landing/WaysToStudy.tsx` (~10 strings)
- `examio-fe/src/components/organisms/landing/PricingBand.tsx` (~10 strings)
- `examio-fe/src/components/organisms/landing/PricingCards.tsx` (~5 strings)
- `examio-fe/src/components/organisms/landing/CoralCallout.tsx` (~8 strings)

## Todo List

- [x] HeaderSection: replace all strings with `t()` calls
- [x] HeaderSection: expand `locales` array to include `ja`
- [x] HeaderSection: replace `handleLocale` with `i18n.changeLanguage()`
- [x] FooterSection: move `linkGroups` inside component, replace strings
- [x] FooterSection: replace newsletter + bottom bar strings
- [x] HeroBand: replace badge, headline, description, CTAs
- [x] TrustStrip: replace badge and item labels
- [x] FeatureGrid: move `features` array inside, replace strings
- [x] ProductShowcase: move `steps` inside, replace strings
- [x] WaysToStudy: move `ways` array inside, replace strings
- [x] PricingBand: replace `tierMeta` and section strings
- [x] PricingCards: replace toggle, badge, period labels
- [x] CoralCallout: replace badge, headline, description, stats
- [x] Run `yarn build` — verify no errors
- [x] Manual test: switch language, verify all text updates

## Success Criteria

- [x] Zero hardcoded Vietnamese strings in all 10 modified files (except mockup/terminal components)
- [x] Language switch in HeaderSection updates all visible text instantly
- [x] Vietnamese text matches current hardcoded text exactly
- [x] No layout shift or visual regression
- [x] `yarn build` passes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Module-scope arrays not reactive to language change | High | High | Move arrays inside component body or wrap in useMemo with `[t]` dependency |
| Missing key in locale JSON | Medium | Medium | Fallback to English via `fallbackLng` config |
| Performance from re-rendering on language switch | Low | Low | Only components using `useTranslation` re-render |
| PricingBand `tierMeta` stale after locale change | Low | Medium | Move `tierMeta` inside component or use `useMemo` |

## Security Considerations

- No user input in translation strings
- `aria-label` translations don't expose sensitive info

## Next Steps

- Phase 04: i18n for auth pages
- Phase 05: LanguageSwitcher component (currently HeaderSection has inline locale dropdown — extract in Phase 05)
