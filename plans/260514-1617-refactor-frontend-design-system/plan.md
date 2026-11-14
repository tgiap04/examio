# Refactor Frontend Design System

## Overview
- Goal: refactor `kmaedu-fe` design system to follow `DESIGN.md` and `ui-design.html`.
- Scope: global tokens, Tailwind theme, shared primitives, public/landing pages, auth flows, dashboard shell, and high-traffic reusable surfaces.
- Strategy: token-first migration, keep behavior/API unchanged, avoid big-bang page rewrites.

## References
- `DESIGN.md`
- `ui-design.html`
- `kmaedu-fe/src/app/globals.css`
- `kmaedu-fe/tailwind.config.ts`
- `kmaedu-fe/src/components/antd/button.tsx`
- `kmaedu-fe/src/routes/layouts/PublicLayout.tsx`

## Phase Status
- [x] Phase 01: Token foundation and CSS variables - `phase-01-token-foundation.md`
- [x] Phase 02: Tailwind theme and utility alignment - `phase-02-tailwind-theme.md`
- [x] Phase 03: Shared primitive component migration - `phase-03-shared-primitives.md`
- [x] Phase 04: Public layout and landing migration - `phase-04-public-landing.md`
- [x] Phase 05: Auth experience migration - `phase-05-auth-experience.md`
- [x] Phase 06: Dashboard shell and feature surface migration - `phase-06-dashboard-shell.md`
- [x] Phase 07: Validation, cleanup, and docs sync - `phase-07-validation-cleanup.md`

## Key Decisions
- Preserve existing routes, stores, API clients, auth behavior, and form submit logic.
- Map legacy semantic variables such as `--background`, `--primary`, `--border`, and `--sidebar` to the new warm editorial tokens first, so current Tailwind classes keep working.
- Use `Cormorant Garamond`/`EB Garamond` fallback for display and current sans fallback for body unless licensed fonts are provided.
- Prefer staged replacement of hard-coded `red-*`, `yellow-*`, `gray-*`, `bg-white`, and heavy shadow classes over whole-app rewrites.

## Dependencies
- Phase 01 blocks all visual migration phases.
- Phase 02 should follow Phase 01 before primitive/page work.
- Phase 03 should finish before wide page migration where possible.
- Phases 04, 05, and 06 can run in parallel after Phases 01-03.
- Phase 07 runs last.

## Validation
- Completed: `cd kmaedu-fe && yarn lint && yarn build` passed.
- Lint: 63 warnings, 0 errors; warnings are existing style warnings.
- Build: passed with large chunk warnings only.
- Reviewer fixes applied: restored `--animate-grid`, removed hard-forced input height/padding, and replaced user-visible KMA branding in migrated auth/logo/feedback/footer with KMAEdu/brand mark.

## Open Questions
- Should KMA red/yellow branding be fully removed, or preserved in limited institutional logo/copy areas?
- Are licensed fonts available, or should implementation use public fallbacks only?
- Should first implementation target only landing/auth, or include dashboard shell in same pass?
