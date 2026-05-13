# Phase 02 — Form and Basic Primitives

## Overview

Priority: Critical  
Status: completed

Migrate các primitive dùng nhiều nhất trước: Button, Input, Textarea, Label/Form, Checkbox, Radio, Switch, Slider, Input OTP.

## Context Links

- `src/components/ui/button.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/checkbox.tsx`
- `src/components/ui/radio-group.tsx`
- `src/components/ui/switch.tsx`
- `src/components/ui/slider.tsx`
- `src/components/ui/input-otp.tsx`
- `src/pages/auth/*`
- `src/pages/k/*`
- `src/components/atoms/*`

## Requirements

- Replace imports from `@/components/ui/button` with `antd/es/button` or `{ Button } from "antd"` consistently.
- Replace form inputs with AntD `Input`, `Input.TextArea`, `Checkbox`, `Radio.Group`, `Switch`, `Slider`.
- Preserve loading/disabled/onChange semantics.
- Avoid changing validation logic unless needed for AntD controlled component shape.
- Prefer native labels or AntD `Form.Item` only where form validation benefits from it.

## Implementation Steps

1. Migrate auth pages first because they cover common form primitives.
2. Migrate shared atoms/molecules using Button/Input/Label.
3. Migrate page-level usages in `src/pages/k` and `src/app/k`.
4. For each changed group, run TypeScript build or at least `yarn build` after a coherent batch.
5. Remove unused imports introduced by migration.

## Mapping Notes

- shadcn `Button variant="outline"` → AntD `Button` default or `variant`/`type` as appropriate.
- shadcn `Button variant="destructive"` → AntD `Button danger`.
- shadcn `Input` → AntD `Input`.
- shadcn `Textarea` → AntD `Input.TextArea`.
- shadcn `Switch checked/onCheckedChange` → AntD `Switch checked/onChange`.
- shadcn `Checkbox checked/onCheckedChange` → AntD `Checkbox checked/onChange` with `event.target.checked` where needed.

## Success Criteria

- No remaining imports for migrated primitive files in touched areas.
- Build pass.
- Auth and major form flows still usable.

## Risks

- Event signatures differ between Radix and AntD.
- AntD Form may rerender/layout differently; do not over-convert simple forms.

## Todo

- [ ] Auth forms
- [ ] Shared atoms/molecules
- [ ] Student/teacher k pages basic controls
- [ ] Build/lint
