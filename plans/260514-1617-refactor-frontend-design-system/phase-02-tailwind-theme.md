# Phase 02: Tailwind Theme And Utility Alignment

## Context Links
- `kmaedu-fe/tailwind.config.ts`
- `kmaedu-fe/src/app/globals.css`
- `DESIGN.md` colors, typography, spacing, radius sections

## Overview
- Priority: Critical
- Status: Completed
- Align Tailwind extension values with the new design tokens and remove unrelated purple/glass defaults.

## Key Insights
- Current config includes purple glow shadows and generic gradient tokens that conflict with the warm editorial system.
- Tailwind CSS 4 is installed, so most token exposure should stay in CSS variables and `@theme inline`.

## Requirements
- Expose warm color tokens consistently.
- Keep animation utilities only if used and brand-compatible.
- Add practical shadow/radius/container tokens without overbuilding.
- Avoid import-order or lint churn.

## Architecture
- CSS variables define values; Tailwind config provides convenience extension only.
- Prefer semantic utility names already used by the app.

## Related Code Files
- Modify: `kmaedu-fe/tailwind.config.ts`
- Read: `kmaedu-fe/src/app/globals.css`

## Implementation Steps
1. Replace purple/glass shadow values with subtle editorial shadows or remove unused entries.
2. Add color aliases for canvas, surface-card, surface-soft, surface-dark, hairline, coral, muted, on-dark.
3. Add radius aliases matching `8px`, `12px`, `16px`, and pill.
4. Keep existing animation keyframes if referenced; otherwise defer deletion until grep confirms no usage.
5. Run quick grep for removed utility names before finalizing.

## Todo List
- [x] Update Tailwind color extension.
- [x] Update shadow/radius extension.
- [x] Audit animation usage.
- [x] Remove or remap conflicting purple/glass values.

## Success Criteria
- No theme values advertise purple/glass as primary design language.
- Existing class usage remains build-safe.
- Tailwind utilities align with `ui-design.html` token names.

## Risk Assessment
- Some components may use `shadow-glow` or gradient classes; remap before removal.

## Security Considerations
- No security impact.

## Next Steps
- Refactor shared primitives to consume tokenized utilities.
