---
title: "Phase 05: Language Switcher Component"
description: "Extract LanguageSwitcher from HeaderSection into a reusable component, add to FooterSection"
status: completed
priority: P2
effort: 0.5h
tags: [i18n, language-switcher, ui-component]
---

# Phase 05: Language Switcher Component

## Context Links

- [plan.md](./plan.md) — overview
- [phase-03](./phase-03-public-layout-pages.md) — HeaderSection i18n (must complete first)

## Overview

Extract the language dropdown currently inline in HeaderSection into a standalone `LanguageSwitcher` component. Reuse it in the FooterSection where the footer currently shows a static "Tiếng Viet" label. This makes the language selector consistent across header and footer.

**Priority:** P2 (nice-to-have, can ship without it)
**Status:** completed

## Key Insights

- HeaderSection already has a dropdown UI for locale selection (Globe icon + DropdownMenu)
- FooterSection currently shows a static `span` with a Vietnamese flag emoji and "Tiếng Viet" text
- The LanguageSwitcher should be a small, self-contained component (~30-40 lines)
- It reads/writes language via `i18n.changeLanguage()` — no local state needed
- The `locales` array (vi, en, ja) should be defined in one place

## Requirements

### Functional
- Dropdown shows all 3 supported languages with native names
- Current language is highlighted
- Clicking a language updates all translated text immediately
- Language persists in localStorage via LanguageDetector

### Non-functional
- Component under 40 lines
- Reusable in HeaderSection and FooterSection
- Uses existing Ant Design DropdownMenu pattern (consistent with current UI)
- Accessible (aria-label, keyboard navigation)

## Architecture

### Component Tree
```
LanguageSwitcher
  └─ DropdownMenu (trigger: Globe icon + current lang short code)
       └─ DropdownMenuItem × 3 (vi, en, ja)
```

## Related Code Files

### Files to Create
- `examio-fe/src/components/molecules/language-switcher.tsx` (~35 lines)

### Files to Modify
- `examio-fe/src/components/molecules/HeaderSection.tsx` — replace inline locale dropdown with `<LanguageSwitcher />`
- `examio-fe/src/components/organisms/FooterSection.tsx` — replace static language span with `<LanguageSwitcher />`

## Todo List

- [x] Create `src/components/molecules/language-switcher.tsx`
- [x] Update HeaderSection to use `<LanguageSwitcher />`
- [x] Remove inline locale state from HeaderSection
- [x] Update FooterSection to use `<LanguageSwitcher />`
- [x] Run `yarn build` — verify no errors
- [x] Manual test: switch language in header, verify footer updates
- [x] Manual test: switch language in footer, verify header updates

## Success Criteria

- [x] `LanguageSwitcher` is a standalone, reusable component
- [x] HeaderSection uses `<LanguageSwitcher />` — no inline locale logic
- [x] FooterSection shows `<LanguageSwitcher />` instead of static text
- [x] Language switch in either location updates all text everywhere
- [x] Component is accessible (aria-label, keyboard nav)
- [x] `yarn build` passes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Footer dark theme styling mismatch | Low | Low | Use same className pattern, test dark mode |
| DropdownMenu z-index conflict in footer | Low | Low | Use existing DropdownMenu component with `align="end"` |
| LanguageSwitcher not rendering in AuthLayout | Low | Low | AuthLayout doesn't show header — language defaults to saved preference |

## Security Considerations

- No sensitive data in language selection
- localStorage key `examio-i18next.locale` is non-sensitive; `examio.locale` (legacy) is untouched

## Next Steps

- Phase 06: Legal and content pages i18n
