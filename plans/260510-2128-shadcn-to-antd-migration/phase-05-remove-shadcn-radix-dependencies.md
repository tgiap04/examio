# Phase 05 — Remove shadcn/Radix Dependencies

## Overview

Priority: Critical  
Status: completed

Sau khi toàn bộ usage được migrate, xóa component shadcn/Radix và dependency liên quan khỏi project.

## Context Links

- `package.json`
- `yarn.lock`
- `components.json`
- `src/components/ui/*`
- `src/lib/utils.ts`
- `tailwind.config.ts`

## Requirements

- Không xóa dependency khi còn usage.
- Xóa `src/components/ui` chỉ sau khi import count về 0 hoặc chỉ còn file icon/custom được quyết định giữ/move.
- Xóa `components.json` nếu không còn dùng shadcn CLI.
- Xóa dependency Radix/shadcn helper không còn dùng.
- Giữ `tailwind-merge`/`cn` nếu codebase ngoài shadcn còn dùng `cn` cho layout; chỉ remove khi grep xác nhận không còn dùng.

## Removal Checklist

Run before removal:

```bash
grep -R "@/components/ui/" -n src
grep -R "@radix-ui" -n src package.json
grep -R "class-variance-authority\|cva(" -n src package.json
grep -R "vaul" -n src package.json
grep -R "tailwind-merge\|cn(" -n src package.json
```

Candidate deps to remove if unused:

- `@radix-ui/react-alert-dialog`
- `@radix-ui/react-avatar`
- `@radix-ui/react-checkbox`
- `@radix-ui/react-dialog`
- `@radix-ui/react-dropdown-menu`
- `@radix-ui/react-icons`
- `@radix-ui/react-label`
- `@radix-ui/react-progress`
- `@radix-ui/react-radio-group`
- `@radix-ui/react-scroll-area`
- `@radix-ui/react-select`
- `@radix-ui/react-separator`
- `@radix-ui/react-slider`
- `@radix-ui/react-slot`
- `@radix-ui/react-switch`
- `@radix-ui/react-tabs`
- `@radix-ui/react-tooltip`
- `class-variance-authority`
- `vaul`

## Implementation Steps

1. Verify all grep checks.
2. Move any non-shadcn custom icons/components out of `src/components/ui` if still needed.
3. Delete obsolete `src/components/ui` files.
4. Remove unused dependencies via `yarn remove ...`.
5. Delete `components.json` if unused.
6. Run build/lint.

## Success Criteria

- No shadcn/Radix imports in `src`.
- No `@radix-ui/*` deps in `package.json` unless explicitly justified.
- `yarn.lock` updated.
- Build/lint pass.

## Risks

- Some Radix deps may be used indirectly by third-party components; remove only direct deps from package if source no longer imports them.
- Deleting `src/components/ui` may remove custom icons (`FacebookIcon`, `GithubIcon`) still used; move them first.

## Todo

- [ ] Grep usage to 0
- [ ] Move custom non-shadcn files if needed
- [ ] Delete shadcn files
- [ ] Remove deps
- [ ] Build/lint
