---
title: "i18n Locale Support for Landing & Auth Pages"
description: "Add internationalization (vi/en/ja) to PublicLayout and AuthLayout routes in examio-fe using react-i18next"
status: completed
priority: P2
effort: 8h
branch: main
tags: [i18n, locale, internationalization, react-i18next, landing, auth]
created: 2026-06-01
---

# i18n Locale Support for Landing & Auth Pages

## Overview

Add full internationalization support to all public-facing pages (landing + auth) in examio-fe. The app currently hardcodes Vietnamese text across ~17 source files with ~200 translatable strings. This plan introduces react-i18next with lazy-loaded JSON locale files for 3 languages: Vietnamese (vi), English (en), Japanese (ja).

## Scope

**In scope:** PublicLayout routes (landing pages), AuthLayout routes (auth pages), HeaderSection, FooterSection, NotFoundPage.

**Out of scope:** KLayout pages (dashboard/app), backend API changes, CMS integration, admin panel locale management.

## Phases

| # | Phase | Status | Effort | Depends On |
|---|-------|--------|--------|------------|
| 01 | Install & Configure i18next | completed | 1h | -- |
| 02 | Create Translation JSON Files | completed | 1.5h | 01 |
| 03 | i18n PublicLayout Pages | completed | 2h | 01, 02 |
| 04 | i18n Auth Pages | completed | 1.5h | 01, 02 |
| 05 | Language Switcher Component | completed | 0.5h | 01, 03 |
| 06 | Legal & Content Pages | completed | 1.5h | 01, 02 |

## Key Decisions

- **Library:** react-i18next + i18next + i18next-http-backend + i18next-browser-languagedetector
- **Locale persistence:** Separate key for i18next (`examio-i18next.locale`), keep `examio.locale` as legacy in HeaderSection
- **Namespace strategy:** 3 namespaces — `common` (nav, footer, shared), `landing` (homepage sections), `auth` (login, register, password reset)
- **PricingBand:** Pricing tier names/descriptions/feature labels fetched from API with locale-aware fields (e.g., `nameVi`, `nameEn`, `descriptionVi`, `descriptionEn`) — static locale files cover only static UI strings (badge, headline, error message, toggle labels, popular badge, free label, period labels)
- **Legal pages:** Legal/About content stored in locale files now (interim); CMS integration with locale param deferred to later phase
- **Pattern:** `useTranslation('namespace')` hook, no `Trans` component needed (no JSX interpolation in text nodes)

## Risk Summary

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Locale JSON load failure | Low | High | `fallbackLng: 'en'` ensures app never shows keys |
| Bundle size increase | Low | Medium | HTTP backend lazy-loads only needed namespace+lang (~20KB gzipped total) |
| localStorage key conflict | Low | Low | Reuse existing `examio.locale` key |
| Ant Design locale mismatch | Low | Medium | Phase 01 sets AntD locale to match i18next language |

## Success Criteria

- [x] Language switcher visible in HeaderSection, changes language across all pages
- [x] All ~200 strings replaced with `t()` calls — zero hardcoded Vietnamese in in-scope files
- [x] Language persists across page refreshes via localStorage
- [x] Fallback to English if translation missing
- [x] No regressions in existing functionality
- [x] `yarn build` passes without errors
- [x] Bundle size increase < 5KB gzipped (code only, excluding lazy-loaded JSON)
