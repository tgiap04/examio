# Phase 4 — Frontend: Add Word Family to Sidebar

## Context
- Parent plan: `plan.md` — Remove GenAI Knowledge + Add Word Family
- Depends on: Phase 1 (removes sidebar entry that Word Family replaces in slot)
- The Word Family pages and routes already exist from the previous session

## Overview
- Priority: P2
- Status: pending
- Description: Add "Word Family" entry to the KLayout sidebar navigation

## Scope

### Files to Modify
| File | Change |
|------|--------|
| `src/components/organisms/k/SideBar.tsx` | Add Word Family nav item to `itemSiderbar` array |

### Already Complete (from previous session)
- `src/pages/k/WordFamilyPage.tsx` — Category grid page
- `src/pages/k/WordFamilyCategoryPage.tsx` — Root words list
- `src/pages/k/WordFamilyDetailPage.tsx` — Word detail with tree/list views
- `src/routes/index.tsx` — Routes for `/k/word-family/*` already wired

## Implementation Steps

1. **Add sidebar entry** to `itemSiderbar` array in `SideBar.tsx`
   - Insert after "Cong cu AI" (position where GenAI Knowledge was)
   - Pattern: `{ name: "Word Family", href: "/k/word-family", icon: <BookOpen />, label: "Từ vựng theo nhóm", active: currentPath.startsWith("/k/word-family") }`
   - Use `BookOpen` from lucide-react (already imported)

2. **Verify**
   - Sidebar shows "Từ vựng theo nhóm" entry
   - Clicking it navigates to `/k/word-family`
   - TypeScript + ESLint pass

## Success Criteria
- Word Family appears in sidebar between "Cong cu AI" and "Tai lieu cua toi"
- Navigation works correctly
- Build passes
