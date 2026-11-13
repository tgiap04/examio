# FE: KMA red brand, light-only theme, modern SaaS controls

Status: done (uncommitted) · Requested 2026-11-13.

## Decisions

- Brand red from `~/Downloads/KMA_logo.png`: measured `#EE2F2B` (dominant pixel). Contrast on white is 4.14, so filled
  controls use `#D92D29` (white text 4.82:1). Tinted controls use bg `#FEF1F0` with text `#B4231F` (5.95:1).
- Style from the design-ui dataset: "Soft UI Evolution" (SaaS; soft shadows; radius 8-12; AA contrast). Background
  `#F8FAFC` and text `#1E293B` come from the dataset's design system. Its blue palette is replaced by the logo red,
  as the user asked. The dataset also says to avoid dark mode by default.
- Neutrals move from warm cream to cool slate. Cards and surfaces are white on a `#F8FAFC` page.
- Light only: no `.dark` tokens, next-themes forced to `light`, no theme toggles, and the dead theme-settings UI is removed.
- Buttons are smaller (antd controlHeight 40 → 34, sm 28, lg 40). The default Button and Badge use the tinted style.
  A solid variant stays for a single strong CTA. Raw `bg-coral text-white` buttons become tinted, one size smaller.
- Logo: the KMA seal (`public/logo.png`, resized) replaces `logo_light.png`/`logo_dark.png`. It is also the favicon.
  Wordmark "KMA" is in brand red.

## Files

`src/app/globals.css`, `src/provider/{AppProviders,ThemeProvider}.tsx`, `src/components/antd/{button,badge}.tsx`,
`src/components/atoms/Logo.tsx`, the layouts and pages that had theme toggles, `index.html`, `public/` assets,
hard-coded hex colours (`pos-meta.ts`, `HeroSection.tsx`), raw coral buttons (codemod).

## Verification

`yarn build`, `yarn lint` on touched files, `yarn test`, plus a browser check of login, `/k` and a landing page.

## Follow-up: /k layout (2026-11-13)

- Sidebar: 248px (64px collapsed); 36px items at 13px with plain 18px icons; active = brand-soft fill, deep red text
  and a 3px red rail; nav grouped "Học tập" / "Quản trị"; compact user row (avatar first) plus a ghost logout icon.
- Header: 64px, translucent white with blur; ghost collapse toggle; current page title taken from `NAV_ITEMS`
  (longest href match); search field with a working ⌘K / Ctrl+K shortcut. Content area sits on `bg-page`.
- `ProfileDropdown`: avatar first and 32px; header trigger is a bare avatar with a hover ring; tighter menu
  (the stray amber "Hồ sơ" text is fixed).
- Checked with headless Chrome: /k/my-materials, /k/history (expanded and collapsed), /k/word-family, mobile 390px.
