# Phase 03: Shared Primitive Component Migration

## Context Links
- `examio-fe/src/components/antd/button.tsx`
- `examio-fe/src/components/antd/card.tsx`
- `examio-fe/src/components/antd/dialog.tsx`
- `examio-fe/src/components/antd/input-otp.tsx`
- `DESIGN.md` components section

## Overview
- Priority: High
- Status: Completed
- Tokenize reusable primitives so downstream pages inherit the new design with minimal page churn.

## Key Insights
- The `components/antd` directory wraps Ant Design and shadcn-like primitives behind local APIs.
- `Button` still contains legacy variants like `gradient` and `glass`.
- Primitive APIs should remain backward-compatible.

## Requirements
- Preserve exported component names and prop shapes.
- Map default/primary to coral CTA.
- Map outline/secondary to cream + hairline styles.
- Map dark variants to dark elevated surfaces.
- Use semantic success/warning/error tokens for state variants.

## Architecture
- Keep wrapper components as compatibility layer.
- Update variant class maps rather than rewriting call sites.
- Avoid creating parallel enhanced components.

## Related Code Files
- Modify: `examio-fe/src/components/antd/button.tsx`
- Modify: `examio-fe/src/components/antd/card.tsx`
- Modify as needed: input, dialog, badge, tabs, tooltip, drawer, sheet, skeleton.

## Implementation Steps
1. Audit primitive exports and variant class maps.
2. Refactor `Button` variant classes to design tokens.
3. Refactor `Card` and dialog surfaces for cream cards, hairlines, and dark elevated panels.
4. Normalize input focus ring to coral 15% alpha.
5. Keep deprecated variant names as aliases if call sites still use them.
6. Build after the primitive pass before page migration.

## Todo List
- [x] Audit primitive variant usage.
- [x] Refactor button variants.
- [x] Refactor card/dialog/input surfaces.
- [x] Preserve backward-compatible exports.
- [x] Run build/lint checkpoint.

## Success Criteria
- Common buttons/cards/inputs match `ui-design.html` defaults.
- Call sites do not need broad API changes.
- No business behavior changes.

## Risk Assessment
- Ant Design default CSS may override local classes; use existing override pattern carefully.
- Deprecated `gradient`/`glass` variants may be used in landing/auth pages.

## Security Considerations
- No security impact.

## Next Steps
- Migrate public layout and landing pages with primitives in place.
