---
title: "Phase 02: Create Translation JSON Files"
description: "Create locale JSON files (vi/en/ja) for 3 namespaces: common, landing, auth"
status: completed
priority: P1
effort: 1.5h
tags: [i18n, translations, json]
---

# Phase 02: Create Translation JSON Files

## Context Links

- [plan.md](./plan.md) — overview
- [phase-01](./phase-01-install-config.md) — i18n config (must complete first)
- `examio-fe/public/locales/` — target directory

## Overview

Create 9 JSON locale files (3 languages x 3 namespaces) containing all translatable strings for in-scope pages. Extract strings from source code into structured JSON with flat namespace-key paths.

**Priority:** P1 (blocking for phases 03-06)
**Status:** completed

## Key Insights

- Vietnamese strings are the source of truth — translate from vi to en/ja
- String count: ~200 unique strings across ~17 files
- Namespace boundaries: `common` (shared nav/footer), `landing` (homepage sections), `auth` (login/register/reset)
- Legal page content is long-form — use dotted keys for section structure (`terms.section1.title`, `terms.section1.body`). Interim only — CMS integration with locale param comes later.
- PricingBand static UI strings go to locale (badge, headline, toggle, popular badge, error); tier names/descriptions/feature labels come from API with locale-aware fields (`nameVi`, `nameEn`, `nameJa`, etc.)

## Requirements

### Functional
- All 9 JSON files created and valid
- Vietnamese (vi) is complete and matches current hardcoded text exactly
- English (en) is complete with accurate translations
- Japanese (ja) is complete with accurate translations
- JSON keys are flat (no nested objects deeper than 2 levels)

### Non-functional
- Each file under 500 lines
- Valid JSON (no trailing commas, proper escaping)
- Key naming: `dot.separated.lowercase` (e.g., `nav.features`, `hero.headline`)
- No interpolation placeholders in this phase — just raw text strings

## Architecture

### File Structure
```
examio-fe/public/locales/
├── vi/
│   ├── common.json
│   ├── landing.json
│   └── auth.json
├── en/
│   ├── common.json
│   ├── landing.json
│   └── auth.json
└── ja/
    ├── common.json
    ├── landing.json
    └── auth.json
```

## Related Code Files

### Files to Create
- `examio-fe/public/locales/vi/common.json`
- `examio-fe/public/locales/vi/landing.json`
- `examio-fe/public/locales/vi/auth.json`
- `examio-fe/public/locales/en/common.json`
- `examio-fe/public/locales/en/landing.json`
- `examio-fe/public/locales/en/auth.json`
- `examio-fe/public/locales/ja/common.json`
- `examio-fe/public/locales/ja/landing.json`
- `examio-fe/public/locales/ja/auth.json`

### Files to Read (source of strings)
- `examio-fe/src/components/molecules/HeaderSection.tsx`
- `examio-fe/src/components/organisms/FooterSection.tsx`
- `examio-fe/src/components/organisms/landing/HeroBand.tsx`
- `examio-fe/src/components/organisms/landing/TrustStrip.tsx`
- `examio-fe/src/components/organisms/landing/FeatureGrid.tsx`
- `examio-fe/src/components/organisms/landing/ProductShowcase.tsx`
- `examio-fe/src/components/organisms/landing/WaysToStudy.tsx`
- `examio-fe/src/components/organisms/landing/PricingBand.tsx`
- `examio-fe/src/components/organisms/landing/PricingCards.tsx`
- `examio-fe/src/components/organisms/landing/CoralCallout.tsx`
- `examio-fe/src/components/organisms/auth/signin-form.tsx`
- `examio-fe/src/components/organisms/auth/signup-form.tsx`
- `examio-fe/src/pages/auth/ForgotPasswordPage.tsx`
- `examio-fe/src/pages/auth/ResetPasswordPage.tsx`
- `examio-fe/src/routes/index.tsx` (NotFoundPage)
- Legal pages: TermsPage, PrivacyPage, CookiesPage, SecurityPage
- `examio-fe/src/components/organisms/AboutSection.tsx`
- `examio-fe/src/components/organisms/ContactSection.tsx`

## Todo List

- [x] Create directory structure under `public/locales/`
- [x] Create `vi/common.json` (~45 keys)
- [x] Create `vi/landing.json` (~60 keys, pricing tierMeta comes from API)
- [x] Create `vi/auth.json` (~35 keys)
- [x] Create `en/common.json` (translate from vi)
- [x] Create `en/landing.json` (translate from vi)
- [x] Create `en/auth.json` (translate from vi)
- [x] Create `ja/common.json` (translate from vi)
- [x] Create `ja/landing.json` (translate from vi)
- [x] Create `ja/auth.json` (translate from vi)
- [x] Validate all 9 JSON files parse correctly
- [x] Run `yarn build` — verify no errors

## Success Criteria

- [x] All 9 JSON files exist and are valid JSON
- [x] Vietnamese strings exactly match current hardcoded text
- [x] English and Japanese translations are complete (no missing keys)
- [x] Key structure is flat (max 2 levels deep)
- [x] `yarn build` passes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Missing string in JSON | Medium | Medium | Cross-reference every source file during extraction |
| JSON syntax error | Low | High | Validate all files with Node.js `JSON.parse` |
| Translation quality (ja) | Medium | Low | Use natural phrasing, not machine-literal translation |
| Key naming inconsistency | Low | Medium | Follow dot.separated convention consistently |

## Security Considerations

- Locale files are public static assets — no sensitive data
- No user-generated content in translation keys

## Next Steps

- Phase 03: Replace hardcoded strings in PublicLayout pages with `t()` calls
- Phase 04: Replace hardcoded strings in AuthLayout pages
