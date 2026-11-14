# Phase 05: Auth Experience Migration

## Context Links
- `kmaedu-fe/src/routes/layouts/AuthLayout.tsx`
- `kmaedu-fe/src/components/organisms/auth/auth-layout-shell.tsx`
- `kmaedu-fe/src/components/organisms/auth/signin-form.tsx`
- `kmaedu-fe/src/components/organisms/auth/signup-form.tsx`
- `kmaedu-fe/src/pages/auth/*.tsx`

## Overview
- Priority: High
- Status: Completed
- Bring login/register/forgot/reset flows into the same cream, coral, and editorial visual system.

## Key Insights
- Auth UI currently uses red/yellow gradients and KMA-specific copy/decoration.
- Auth behavior is sensitive; keep store/API/OAuth redirects untouched.

## Requirements
- Cream canvas background with subtle warm pattern.
- Auth cards use canvas or surface-card with hairline, not heavy shadow/white glass.
- Primary submit buttons use coral.
- Inputs use cream surface, hairline, coral focus ring.
- Error, loading, disabled, and OAuth buttons remain clear and accessible.

## Architecture
- Auth shell owns page atmosphere and top auth nav.
- Auth forms own local field and submit UI only.
- Keep all validation and store calls unchanged.

## Related Code Files
- Modify: `auth-layout-shell.tsx`, `signin-form.tsx`, `signup-form.tsx`
- Modify as needed: forgot/reset auth page components
- Do not modify unless necessary: `useAuthStore`, `authApi`

## Implementation Steps
1. Replace auth shell gradient/white surfaces with design tokens.
2. Refactor login form card, labels, inputs, buttons, dividers, OAuth buttons.
3. Refactor register form with same component pattern.
4. Apply same treatment to forgot/reset pages.
5. Verify focus, error, loading, and disabled states.

## Todo List
- [x] Migrate auth shell.
- [x] Migrate sign-in form.
- [x] Migrate sign-up form.
- [x] Migrate forgot/reset flows.
- [x] Smoke test auth interactions.

## Success Criteria
- Auth UI matches public design language.
- Login/register functionality unchanged.
- OAuth redirects still use existing env/API behavior.

## Risk Assessment
- Form components may use both native inputs and shared primitives; normalize carefully.

## Security Considerations
- Do not change token storage, device ID, OAuth endpoints, password handling, or recaptcha behavior.

## Next Steps
- Migrate dashboard shell once public/auth surfaces establish patterns.
