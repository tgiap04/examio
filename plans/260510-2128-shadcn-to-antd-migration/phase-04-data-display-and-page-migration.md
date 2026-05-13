# Phase 04 — Data Display and Page Migration

## Overview

Priority: High  
Status: completed

Migrate Card, Badge, Avatar, Table, Progress, Skeleton, ScrollArea, Separator, Breadcrumb, Item/Field và các page còn import `@/components/ui/*`.

## Context Links

- `src/components/ui/card.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/avatar.tsx`
- `src/components/ui/table.tsx`
- `src/components/ui/progress.tsx`
- `src/components/ui/skeleton.tsx`
- `src/components/ui/scroll-area.tsx`
- `src/components/ui/separator.tsx`
- `src/components/ui/breadcrumb.tsx`
- `src/pages/**/*`
- `src/app/**/*`
- `src/components/**/*`

## Requirements

- Replace shadcn Card with AntD `Card` or semantic `div` where AntD card is unnecessary.
- Replace Badge with AntD `Tag`/`Badge` based on semantics.
- Replace Avatar with AntD `Avatar`.
- Replace Table with AntD `Table`, preserving pagination/sort if any.
- Replace Progress with AntD `Progress`.
- Replace Skeleton with AntD `Skeleton`.
- Replace ScrollArea with native overflow container or AntD layout; avoid unnecessary wrappers.
- Replace Breadcrumb with AntD `Breadcrumb`.

## Implementation Steps

1. Run import inventory:
   - `grep -R "@/components/ui/" -n src | cut -d: -f1 | sort -u`
2. Migrate shared components before pages to reduce repeated work.
3. Migrate pages in feature groups:
   - auth/landing
   - k dashboard/profile/subscription/materials
   - AI chat/student programming/genai
   - exam/session/flashcard study
4. Replace purely decorative generated UI components only if they depend on shadcn/Radix; leave custom visual components if independent.
5. Run build after each feature group.

## Success Criteria

- `grep -R "@/components/ui/" src` only returns files intentionally kept for final removal, ideally 0 before phase 05.
- UI remains navigable and readable.
- No page loses loading/error/empty state.

## Risks

- AntD Table requires different column/data shape than hand-rolled table.
- `ScrollArea` replacement can affect chat/session height; test scrolling manually.
- Card/Badge visual density may change; use AntD theme tokens rather than hard-coded colors.

## Todo

- [ ] Shared data display components
- [ ] Auth/landing pages
- [ ] Dashboard/profile/subscription/material pages
- [ ] AI/exam/flashcard pages
- [ ] Build/lint
