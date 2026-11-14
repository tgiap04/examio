---
title: "Phase 01: Install & Configure i18next"
description: "Install react-i18next packages, create i18n config, and wire provider into AppProviders"
status: completed
priority: P1
effort: 1h
tags: [i18n, setup, config]
---

# Phase 01: Install & Configure i18next

## Context Links

- [plan.md](./plan.md) — overview
- `kmaedu-fe/package.json` — current dependencies
- `kmaedu-fe/src/provider/AppProviders.tsx` — provider tree
- `kmaedu-fe/src/main.tsx` — entry point
- `kmaedu-fe/src/components/molecules/HeaderSection.tsx` — existing locale storage

## Overview

Install i18next packages and create the core configuration. Wire the i18n instance into the app so all components can use `useTranslation`. Align the locale storage key with the existing `kmaedu.locale` used by HeaderSection.

**Priority:** P1 (blocking for all other phases)
**Status:** completed

## Key Insights

- User confirmed: separate locale storage key for i18next (NOT `kmaedu.locale` — that stays as legacy in HeaderSection)
- i18next LanguageDetector will use key `kmaedu-i18next.locale` — independent from `kmaedu.locale`
- HeaderSection currently supports `vi` and `en` — Phase 05 adds `ja` via the LanguageSwitcher component
- AppProviders wraps the entire app — i18n init happens at module level (side-effect import in `main.tsx`)
- Ant Design 6 does not require separate locale config for basic usage

## Requirements

### Functional
- i18next initializes before first render
- Language detected from `kmaedu-i18next.locale` localStorage key (separate from legacy `kmaedu.locale`), falls back to browser `navigator.language`, then to `en`
- Supported languages: `vi`, `en`, `ja`
- 3 namespaces: `common`, `landing`, `auth`
- Fallback language: `en`

### Non-functional
- i18n config file under 30 lines
- No impact on existing functionality — `useTranslation` returns current hardcoded text until phases 03-06 replace strings
- Bundle size: ~20KB gzipped for the i18next core + plugins

## Architecture

### Data Flow
```
main.tsx
  → import './lib/i18n' (side-effect: initializes i18next)
  → AppProviders
    → i18next ready
      → Any component can call useTranslation('namespace')
```

### Component Tree
```
main.tsx
  └─ AppProviders
       └─ AntdConfigProvider
            └─ ToastProvider
                 └─ App (router)
```

No new React context or provider wrapper needed — react-i18next uses its own context internally via `initReactI18next`.

## Related Code Files

### Files to Create
- `kmaedu-fe/src/lib/i18n.ts` — i18next configuration (side-effect import)

### Files to Modify
- `kmaedu-fe/package.json` — add dependencies
- `kmaedu-fe/src/main.tsx` — add `import './lib/i18n'` before App import

### Files to Read (no modify)
- `kmaedu-fe/src/components/molecules/HeaderSection.tsx` — confirm `LOCALE_STORAGE_KEY = "kmaedu.locale"`

## Implementation Steps

### Step 1: Install packages
```bash
cd kmaedu-fe
yarn add react-i18next i18next i18next-http-backend i18next-browser-languagedetector
```

### Step 2: Create `src/lib/i18n.ts`
```ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

const LOCALE_KEY = "kmaedu-i18next.locale"; // separate from legacy kmaedu.locale in HeaderSection

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: ["vi", "en", "ja"],
    defaultNS: "common",
    ns: ["common", "landing", "auth"],
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LOCALE_KEY,
      caches: ["localStorage"],
      lookupLocalStorage: LOCALE_KEY,
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
```

### Step 3: Update `src/main.tsx`
Add side-effect import before App import:
```ts
import "./lib/i18n";
```

### Step 4: Verify
- Run `yarn build` — no errors
- Run `yarn dev` — app loads normally (no visible changes yet)

## Todo List

- [x] Install 4 npm packages via yarn
- [x] Create `src/lib/i18n.ts` with i18next config
- [x] Add `import './lib/i18n'` to `src/main.tsx`
- [x] Run `yarn build` — verify no compile errors
- [x] Run `yarn dev` — verify app loads normally

## Success Criteria

- [x] `yarn build` passes without errors
- [x] App renders normally with no visible changes
- [x] `i18next` instance is accessible from any component via `useTranslation()`
- [x] Language detection reads from `kmaedu-i18next.locale` localStorage key
- [x] Fallback to English works when no locale is set

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| HttpBackend path wrong | Low | High | Test with a minimal locale file in step 02 |
| LanguageDetector conflict with existing locale code | Low | Medium | Separate `kmaedu-i18next.locale` key — no conflict with legacy `kmaedu.locale` |
| TypeScript errors from plugin types | Low | Low | Install `@types/i18next` if needed, or use `i18next` built-in types |

## Security Considerations

- No sensitive data in locale files
- localStorage key `kmaedu-i18next.locale` is non-sensitive (language preference only)

## Next Steps

- Phase 02: Create translation JSON files with actual strings
- Phase 03-06: Replace hardcoded strings with `t()` calls
