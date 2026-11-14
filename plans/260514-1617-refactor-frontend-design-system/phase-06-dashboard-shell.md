# Phase 06: Dashboard Shell And Feature Surface Migration

## Context Links
- `kmaedu-fe/src/routes/layouts/KLayout.tsx`
- `kmaedu-fe/src/components/organisms/k/SideBar.tsx`
- `kmaedu-fe/src/templates/*.tsx`
- `kmaedu-fe/src/pages/k/*.tsx`
- `DESIGN.md` cards, inputs, layout, responsive sections

## Overview
- Priority: Medium
- Status: Completed
- Apply the design system to authenticated dashboard shell and high-traffic feature surfaces without rewriting business flows.

## Key Insights
- Dashboard has many pages and inline Tailwind classes; full migration is larger than landing/auth.
- Shell-level changes can improve consistency before each page is fully refactored.

## Requirements
- Use cream canvas for main app floor.
- Sidebar/header surfaces use canvas or surface-card with hairline.
- Stat cards, filter bars, empty states, loading states, tables, and dialogs use tokenized primitives.
- Keep route guards, role behavior, API calls, Zustand stores, and data caching unchanged.

## Architecture
- `KLayout` defines authenticated app frame.
- `SideBar` and common templates provide broad visual leverage.
- Feature-specific components migrate incrementally in priority order.

## Related Code Files
- Modify: `KLayout.tsx`, `SideBar.tsx`
- Modify high-traffic: dashboard pages, management templates, stat cards, search/filter bars, table wrappers, dialogs.
- Avoid broad unrelated edits in API/store files.

## Implementation Steps
1. Refactor `KLayout` surfaces and header warning/payment banner colors to semantic tokens.
2. Refactor sidebar active/inactive states to cream card and coral accent patterns.
3. Refactor dashboard stat cards and common template containers.
4. Refactor common tables/filter bars/dialogs only where reused broadly.
5. Sweep obvious hard-coded red/yellow/white/gray classes in migrated shell files.
6. Validate teacher/student dashboard routes on desktop and mobile.

## Todo List
- [x] Migrate authenticated layout shell.
- [x] Migrate sidebar.
- [x] Migrate dashboard common cards/templates.
- [x] Migrate common filter/table/dialog surfaces.
- [x] Smoke test `/k` flows.

## Success Criteria
- Dashboard shell no longer feels visually disconnected from public/auth pages.
- Feature functionality unchanged.
- Migrated files remain focused and readable.

## Risk Assessment
- The dashboard has many components; limit first pass to shared shell and common surfaces to avoid uncontrolled churn.

## Security Considerations
- Do not change protected route logic, role checks, session invalidation, or auth store behavior.

## Next Steps
- Run validation and create follow-up plan for remaining individual feature pages if needed.
