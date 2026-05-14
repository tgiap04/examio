# Phase 01: Token Foundation And CSS Variables

## Context Links
- `DESIGN.md`
- `ui-design.html`
- `examio-fe/src/app/globals.css`

## Overview
- Priority: Critical
- Status: Completed
- Replace the current KMA red/yellow token base with the warm editorial design tokens while keeping legacy semantic aliases stable.

## Key Insights
- `globals.css` currently defines KMA-specific variables and utility classes.
- Existing app code relies on semantic Tailwind names such as `bg-background`, `text-primary`, `border-border`, and sidebar variables.
- Token remapping reduces churn before page-level refactors.

## Requirements
- Define core colors: canvas, surface-soft, surface-card, surface-cream-strong, surface-dark, surface-dark-elevated, hairline, coral primary, muted text, semantic success/warning/error.
- Map `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--accent`, `--border`, `--input`, `--ring`, and sidebar variables to new tokens.
- Add display/body/mono font CSS variables.
- Keep body on cream canvas with subtle warm atmosphere, not pure white or cool gray.

## Architecture
- `globals.css` remains the source of truth for CSS variables.
- Tailwind `@theme inline` exposes variables to utility classes.
- Old KMA utility classes can remain temporarily only if mapped to new tokens or marked for later removal.

## Related Code Files
- Modify: `examio-fe/src/app/globals.css`
- Do not modify yet: route/page files unless needed for compile errors.

## Implementation Steps
1. Replace root token block with design-system variables from references.
2. Preserve semantic aliases by pointing them to design tokens.
3. Update `@theme inline` with new color/font/radius names.
4. Update base `body` styles for canvas, text color, font family, and background atmosphere.
5. Replace KMA helper class internals with tokenized equivalents or remove unused helpers after grep validation.

## Todo List
- [x] Add design token variables.
- [x] Remap legacy semantic variables.
- [x] Add typography variables.
- [x] Update base body styles.
- [x] Audit KMA helper classes.

## Success Criteria
- Existing Tailwind semantic classes still compile.
- No pure-white global app background remains as default.
- `yarn build` reaches at least TypeScript/CSS processing without token errors.

## Risk Assessment
- Removing legacy variables too early can break many class references.
- Font names may not load if not installed; include robust fallbacks.

## Security Considerations
- No security impact; visual-only token changes.

## Next Steps
- Proceed to Tailwind theme alignment after token aliases are stable.
