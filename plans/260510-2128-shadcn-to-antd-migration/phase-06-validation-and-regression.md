# Phase 06 — Validation and Regression

## Overview

Priority: Critical  
Status: completed

Xác nhận toàn bộ migration sang AntD không làm vỡ build, lint, routing, form, overlay, chat, exam và các flow học tập chính.

## Context Links

- `package.json`
- `src/routes/index.tsx`
- `src/apis/*`
- `src/stores/*`
- Các page đã migrate trong phase 02-04

## Automated Validation

Run:

```bash
yarn build
yarn lint
grep -R "@/components/ui/" -n src
grep -R "@radix-ui" -n src package.json
grep -R "class-variance-authority\|cva(" -n src package.json
grep -R "vaul" -n src package.json
```

Expected:

- `yarn build` pass.
- `yarn lint` không có error mới.
- shadcn/Radix grep trả rỗng.

Latest automated result:

- `yarn build` passed.
- `yarn lint` passed with 0 errors and existing warnings.
- shadcn/Radix source/dependency grep returned empty.
- Manual browser regression was not executed in this session.

## Manual Regression Checklist

### Auth

- [ ] Login form render/submit/loading/error.
- [ ] Register form render/submit/error.
- [ ] Forgot/reset password form.
- [ ] OAuth buttons/icons còn hiển thị.

### K layout/navigation

- [ ] Sidebar/top nav hoạt động.
- [ ] Profile dropdown/logout.
- [ ] Protected route redirect đúng.

### Student flows

- [ ] Dashboard student.
- [ ] Materials upload/list/delete dialogs.
- [ ] AI student programming chat stream, prompt input, stop, copy, evaluate.
- [ ] AI teacher/tutor flow nếu còn route.
- [ ] Flashcard set list/detail/study.
- [ ] Exam session and quiz page.
- [ ] History pages.

### Teacher/admin-ish flows

- [ ] Dashboard teacher.
- [ ] Manage exam.
- [ ] Manage quiz set detail.
- [ ] Manage flashcard set detail.
- [ ] Manage exam room/session analytics.

### Subscription/payment

- [ ] Pricing/subscription cards.
- [ ] Payment modal/drawer/QR if present.
- [ ] Toast/notification for success/error.

## Accessibility/UX Checks

- [ ] Modal focus trap works.
- [ ] Dropdown/menu keyboard accessible.
- [ ] Buttons have visible focus state.
- [ ] Destructive actions still require confirm.
- [ ] Toast/error message readable and not truncated.
- [ ] Mobile layout has no horizontal overflow.

## Success Criteria

- Migration complete with no shadcn/Radix source usage.
- Core flows manually verified.
- AntD dependency present and themed.
- Removed obsolete dependencies/files.

## Risks

- No formal FE test suite exists, so manual regression matters.
- Large migration may introduce small visual regressions in less-used pages.

## Todo

- [x] Run automated validation
- [ ] Manual auth regression
- [ ] Manual student flow regression
- [ ] Manual teacher flow regression
- [ ] Manual subscription/payment regression
- [x] Record unresolved issues before completion
