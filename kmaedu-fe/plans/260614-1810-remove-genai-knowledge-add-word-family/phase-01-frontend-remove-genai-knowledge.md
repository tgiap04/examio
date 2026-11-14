# Phase 1 — Frontend: Remove GenAI Knowledge Page

## Context
- Parent plan: `plan.md` — Remove GenAI Knowledge + Add Word Family
- No backend dependency — this phase is purely frontend

## Overview
- Priority: P2
- Status: pending
- Description: Remove the "Kho tri thuc GenAI" page, sidebar entry, route, components, and access control helper

## Scope

### Files to Delete
| File | Reason |
|------|--------|
| `src/app/k/genai-knowledge/page.tsx` | Main page (1355 lines) |
| `src/components/organisms/k/genai-knowledge/` (10 files) | All sub-components |
| `src/lib/genai-knowledge-access.ts` | Access control helper |

### Files to Modify
| File | Change |
|------|--------|
| `src/routes/index.tsx` | Remove GenAI Knowledge route + import |
| `src/components/organisms/k/SideBar.tsx` | Remove sidebar entry + `restrictedByPolicy` filter logic (if no longer needed) |

### Files NOT to touch
- `src/pages/k/WordFamilyPage.tsx` — already exists
- `src/pages/k/WordFamilyCategoryPage.tsx` — already exists
- `src/pages/k/WordFamilyDetailPage.tsx` — already exists
- Route definitions for `/k/word-family/*` — already wired

## Implementation Steps

1. **Delete page + components + access helper**
   - `rm -rf src/app/k/genai-knowledge/`
   - `rm -rf src/components/organisms/k/genai-knowledge/`
   - `rm src/lib/genai-knowledge-access.ts`

2. **Remove route from `src/routes/index.tsx`**
   - Delete the route object for `/k/genai-knowledge` (lines ~311-319)
   - Remove the `GenAIKnowledgePage` import

3. **Remove sidebar entry from `src/components/organisms/k/SideBar.tsx`**
   - Delete the "GenAI Knowledge" item from `itemSiderbar` array (lines ~91-98)
   - Remove `canAccessGenAIKnowledgeManager` import
   - Remove the `restrictedByPolicy` filter logic (lines ~165-167) — no other items use it
   - Remove the `shortLabel` field from `SidebarItem` interface if no other items use it

4. **Verify build**
   - `cd kmaedu-fe && npx tsc --noEmit`
   - `cd kmaedu-fe && npx eslint src/routes/index.tsx src/components/organisms/k/SideBar.tsx`

## Success Criteria
- `/k/genai-knowledge` route returns 404
- Sidebar no longer shows "Kho tri thuc GenAI"
- TypeScript compiles with zero errors
- ESLint passes with zero errors
- All other `/k` routes remain functional
