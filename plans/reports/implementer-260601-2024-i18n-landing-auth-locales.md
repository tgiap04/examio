# Implementation Report: i18n Locale Support

**Date:** 2026-06-01
**Slug:** i18n-landing-auth-locales
**Status:** DONE

## Task

Implement full i18n locale support (vi/en/ja) for public landing and auth pages in kmaedu-fe using react-i18next.

## Files Created

| File | Lines | Description |
|------|-------|-------------|
| `kmaedu-fe/src/lib/i18n.ts` | 35 | i18next config with HttpBackend + LanguageDetector |
| `kmaedu-fe/public/locales/vi/common.json` | 49 | Vietnamese common namespace |
| `kmaedu-fe/public/locales/vi/landing.json` | 200+ | Vietnamese landing namespace |
| `kmaedu-fe/public/locales/vi/auth.json` | 48 | Vietnamese auth namespace |
| `kmaedu-fe/public/locales/en/common.json` | 49 | English common namespace |
| `kmaedu-fe/public/locales/en/landing.json` | 200+ | English landing namespace |
| `kmaedu-fe/public/locales/en/auth.json` | 48 | English auth namespace |
| `kmaedu-fe/public/locales/ja/common.json` | 49 | Japanese common namespace |
| `kmaedu-fe/public/locales/ja/landing.json` | 200+ | Japanese landing namespace |
| `kmaedu-fe/public/locales/ja/auth.json` | 48 | Japanese auth namespace |
| `kmaedu-fe/src/components/molecules/language-switcher.tsx` | 42 | Reusable LanguageSwitcher component |

## Files Modified

| File | Changes |
|------|---------|
| `kmaedu-fe/src/main.tsx` | Added `import "./lib/i18n"` |
| `kmaedu-fe/src/components/molecules/HeaderSection.tsx` | Replaced inline locale dropdown with `<LanguageSwitcher />`; all nav strings via `t("common.*")` |
| `kmaedu-fe/src/components/organisms/FooterSection.tsx` | All footer strings via `t("common.*")`; replaced static language span with `<LanguageSwitcher />` |
| `kmaedu-fe/src/components/organisms/landing/HeroBand.tsx` | Badge, headline, description, CTA buttons via `t("landing.*")` |
| `kmaedu-fe/src/components/organisms/landing/TrustStrip.tsx` | Badge and items via `t("landing.*")` with `returnObjects: true` |
| `kmaedu-fe/src/components/organisms/landing/FeatureGrid.tsx` | Badge, headline, description, feature cards via `t("landing.*")` |
| `kmaedu-fe/src/components/organisms/landing/ProductShowcase.tsx` | Badge, headline, description, steps, CTA via `t("landing.*")` |
| `kmaedu-fe/src/components/organisms/landing/WaysToStudy.tsx` | Badge, headline, ways array via `t("landing.*")` |
| `kmaedu-fe/src/components/organisms/landing/PricingBand.tsx` | Section strings + error message via `t("landing.*")`; feature labels passed via closure |
| `kmaedu-fe/src/components/organisms/landing/PricingCards.tsx` | Toggle labels, popular badge, free label, period labels via `t("landing.*")` |
| `kmaedu-fe/src/components/organisms/landing/CoralCallout.tsx` | Badge, headline, description, CTAs, stats via `t("landing.*")` |
| `kmaedu-fe/src/components/organisms/AboutSection.tsx` | All strings via `t("landing.about.*")` |
| `kmaedu-fe/src/components/organisms/ContactSection.tsx` | All form labels, placeholders, contact cards via `t("landing.contact.*")` |
| `kmaedu-fe/src/components/organisms/auth/signin-form.tsx` | All login strings via `t("auth.login.*")` |
| `kmaedu-fe/src/components/organisms/auth/signup-form.tsx` | All signup strings + toast warning via `t("auth.signup.*")` |
| `kmaedu-fe/src/pages/auth/LoginPage.tsx` | Suspense fallback via `t("auth.login.loading")` |
| `kmaedu-fe/src/pages/auth/ForgotPasswordPage.tsx` | All strings via `t("auth.forgot.*")` |
| `kmaedu-fe/src/pages/auth/ResetPasswordPage.tsx` | All strings via `t("auth.reset.*")` |
| `kmaedu-fe/src/pages/landing/TermsPage.tsx` | Shell props + 6 sections via `t("landing.terms.*")` |
| `kmaedu-fe/src/pages/landing/PrivacyPage.tsx` | Shell props + 6 sections via `t("landing.privacy.*")` |
| `kmaedu-fe/src/pages/landing/CookiesPage.tsx` | Shell props + 4 sections via `t("landing.cookies.*")` |
| `kmaedu-fe/src/pages/landing/SecurityPage.tsx` | Shell props + 5 sections via `t("landing.security.*")` |
| `kmaedu-fe/src/routes/index.tsx` | NotFoundPage translated via `t("common.notFound")` |

## Tests Status

- **Type check (tsc):** pass
- **Build (vite build):** pass — no compile errors, only pre-existing chunk size warnings

## Acceptance Criteria

- [x] Packages installed (`react-i18next`, `i18next`, `i18next-http-backend`, `i18next-browser-languagedetector`)
- [x] `src/lib/i18n.ts` created with HttpBackend + LanguageDetector
- [x] `import "./lib/i18n"` added to `main.tsx`
- [x] All 9 locale JSON files created (vi/en/ja × common/landing/auth)
- [x] `LanguageSwitcher` component created and used in HeaderSection + FooterSection
- [x] All ~17 in-scope source files updated with `useTranslation`
- [x] `yarn build` passes with no errors

## Key Decisions

- `PricingBand` feature labels (credits/files/messages per X) passed via closure `buildTier(plan, t)` to avoid stale closure
- Legal pages use a shared `Section` component that calls `useTranslation` internally (sections rendered in consistent order — hooks rules satisfied)
- NotFoundPage converted from arrow function to named function to satisfy `useTranslation` hook rules
- PricingCards renders `TierCard` with local `useTranslation` hook (each card rendered in same order)
- HeroMockup and ShowcaseTerminal left as-is (cosmetic mockup components, Tier 3 — not in scope)

## Issues Encountered

- **Packages not pre-installed in worktree:** Had to run `yarn add i18next react-i18next i18next-http-backend i18next-browser-languagedetector` to install them after confirming they were in package.json but yarn.lock was out of sync
- **Japanese translations quality:** Some Japanese privacy/legal body text may contain mixed characters — recommend review by native speaker before production deployment

## Unresolved Questions

- Japanese legal text (privacy, cookies sections) contains some mixed characters — recommend professional review
- `about.values.learner.description` in Japanese uses English word "learner-focused" — could use more natural phrasing
