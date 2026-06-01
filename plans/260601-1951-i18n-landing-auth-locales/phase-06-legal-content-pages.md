---
title: "Phase 06: Legal & Content Pages"
description: "Add i18n to TermsPage, PrivacyPage, CookiesPage, SecurityPage, AboutPage, ContactPage, and NotFoundPage"
status: completed
priority: P1
effort: 1.5h
tags: [i18n, legal, about, contact, content-pages]
---

# Phase 06: Legal & Content Pages

## Context Links

- [plan.md](./plan.md) — overview
- [phase-01](./phase-01-install-config.md) — i18n config (must complete first)
- [phase-02](./phase-02-translation-files.md) — locale JSON files (must complete first)

## Overview

Replace hardcoded Vietnamese text in the 4 legal pages, AboutPage, ContactPage, and NotFoundPage with `t()` calls. Legal pages have long-form content — use a `landing:legal.*` key structure. AboutPage and ContactPage have moderate string counts.

**Priority:** P1
**Status:** completed

## Key Insights

- Legal pages use `LegalPageShell` as a layout wrapper — it receives `eyebrow`, `title`, `lastUpdated` as props
- Each legal page defines local `Section` components with `title` props — these titles and body text need translation
- Legal content is long-form paragraph text — use `t()` for each section, not individual words
- `AboutSection` and `ContactSection` follow the same pattern as landing organisms (arrays + JSX)
- `NotFoundPage` is inline in `routes/index.tsx` — extract to a component or translate inline

## Requirements

### Functional
- All visible text in legal/about/contact pages uses `t()` calls
- Section titles and body text in legal pages translated
- Form labels in ContactPage translated
- `NotFoundPage` text translated

### Non-functional
- Legal page content stored as locale JSON strings (not HTML)
- Each locale file stays under 500 lines
- No CMS integration in this phase — legal content stored in locale files as interim solution. CMS integration with locale param comes in a later phase.

## Architecture

### Legal Page Key Structure
```json
{
  "terms.eyebrow": "Pháp lý",
  "terms.title": "Điều khoản sử dụng",
  "terms.s1.title": "1. Giới thiệu",
  "terms.s1.body": "Chào mừng bạn đến với Examio...",
  ...
}
```

## Related Code Files

### Files to Modify
- `examio-fe/src/pages/landing/TermsPage.tsx` (~6 sections)
- `examio-fe/src/pages/landing/PrivacyPage.tsx` (~6 sections)
- `examio-fe/src/pages/landing/CookiesPage.tsx` (~4 sections)
- `examio-fe/src/pages/landing/SecurityPage.tsx` (~5 sections)
- `examio-fe/src/components/organisms/AboutSection.tsx` (~15 strings)
- `examio-fe/src/components/organisms/ContactSection.tsx` (~15 strings)
- `examio-fe/src/routes/index.tsx` (NotFoundPage inline)

### Files to Read (no modify)
- `examio-fe/src/components/organisms/landing/LegalPageShell.tsx` — layout wrapper (no changes needed)

### Files to Update (locale JSON)
- `examio-fe/public/locales/vi/landing.json` — add `legal.*`, `about.*`, `contact.*` keys
- `examio-fe/public/locales/en/landing.json` — add English translations
- `examio-fe/public/locales/ja/landing.json` — add Japanese translations

## Todo List

- [x] Add `legal.*`, `about.*`, `contact.*` keys to `vi/landing.json`
- [x] Add English translations to `en/landing.json`
- [x] Add Japanese translations to `ja/landing.json`
- [x] TermsPage: replace all section titles and body text
- [x] PrivacyPage: replace all section titles and body text
- [x] CookiesPage: replace all section titles and body text
- [x] SecurityPage: replace all section titles and body text
- [x] AboutSection: replace badge, headline, description, stats, values, CTA
- [x] ContactSection: replace badge, headline, form labels, contact cards, partnership
- [x] NotFoundPage: translate inline text
- [x] Run `yarn build` — verify no errors
- [x] Manual test: visit each page, switch language, verify all text updates

## Success Criteria

- [x] Zero hardcoded Vietnamese strings in all 7 modified files
- [x] Legal page section titles and body text all use `t()` calls
- [x] ContactPage form labels translated
- [x] AboutPage stats, values, mission/vision translated
- [x] NotFoundPage text translated
- [x] `lastUpdated` date renders correctly in all languages
- [x] No layout shift or visual regression
- [x] `yarn build` passes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Locale JSON file too large (>500 lines) | Medium | Low | Legal content is long but structured — keep keys flat |
| `lastUpdated` date format inconsistency | Low | Low | Use simple string interpolation, not Date objects |
| Translation quality for legal text | Medium | Medium | Legal text must be accurate — prioritize quality over speed |
| NotFoundPage inline in routes/index.tsx | Low | Low | Extract to separate file if inline translation is awkward |

## Security Considerations

- Legal page content is public — no sensitive data
- Email addresses in legal pages should remain untranslated
- Contact form has no backend integration — no security concern

## Unresolved Questions

1. **`lastUpdated` date format:** Dates kept as locale-specific strings in JSON.
2. **Legal text accuracy:** Legal translations should be reviewed by a legal professional post-deployment.

## Next Steps

- All phases complete — run full regression test
- Update `docs/project-changelog.md` with i18n feature entry
- Consider adding `antd/locale/vi_VN` etc. if Ant Design date pickers are used in future
