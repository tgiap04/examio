---
title: "Phase 5: Frontend — Word Family UI + Store"
description: "Add Word Family pages, react-d3-tree component, Zustand store with TTL cache, and flashcard bridge UI"
status: pending
priority: P1
effort: 6h
branch: feat.grammary-learn
created: 2026-06-14
---

## Context Links

- Parent: [plan.md](../plan.md)
- Dependencies: Phase 3 (API endpoints ready)
- Reports: [codebase-scan](../reports/researcher-260614-1506-codebase-scan.md)

## Overview

**Date:** 2026-06-14
**Description:** Build frontend for Word Family: category browsing, tree/list toggle view, personal save, flashcard bridge. Uses react-d3-tree for tree view.
**Priority:** P1
**Status:** pending

## Key Insights

- Frontend uses Zustand with manual TTL-based cache (5 min) — no React Query
- Existing flashcard store pattern: `useFlashcardSetStore` — follow same pattern
- Admin panel uses `AdminLayout` with `AdminRoute` guard — extend for Word Family admin
- Routing: add under `/k/word-family/*` for user pages, `/admin/word-family` for admin
- **Auth Guard:** Bearer auth cho **tất cả** endpoints — không có public endpoint nào
- Tree view: `react-d3-tree` library with custom node renderer

## Requirements

### Functional
- **Category list page** (`/k/word-family`): Grid of category cards with image, name, description
- **Category detail page** (`/k/word-family/:slug`): List of root words in category
- **Word Family detail page** (`/k/word-family/:slug/:rootWord`): Tree/List toggle view
  - Tree View: react-d3-tree with custom nodes showing word + POS
  - List View: table with checkboxes for flashcard selection
- **Save to collection**: Button + toast notification
- **Create flashcard**: Select words → create deck modal
- **Zustand store**: TTL 5 min cache, invalidate on CUD

### UI Design
- Raw text focus, minimal icons/borders (per spec)
- Affix highlight: prefix/suffix in muted color, root in bold
- Toggle: Tree ↔ List instant switch (client-side state, no reload)
- Hover/click: Show Vietnamese meaning + example sentence
- Checkbox: For word selection in List View

## Architecture

### Page Structure

```
kmaedu-fe/src/pages/k/
├── word-family/
│   ├── WordFamilyPage.tsx           # Category list
│   ├── WordFamilyCategoryPage.tsx   # Root words list
│   └── WordFamilyDetailPage.tsx     # Tree/List view

kmaedu-fe/src/components/k/
├── word-family/
│   ├── WordFamilyCategoryCard.tsx
│   ├── WordFamilyTreeView.tsx        # react-d3-tree wrapper
│   ├── WordFamilyListView.tsx       # Table with checkboxes
│   ├── WordFamilyNode.tsx           # Custom tree node
│   ├── WordFamilyToggle.tsx         # Tree/List toggle
│   ├── WordFamilyWordRow.tsx        # List row with checkbox
│   └── CreateFlashcardModal.tsx      # Create deck modal
```

### Zustand Store

```typescript
interface WordFamilyState {
  categories: WordFamilyCategory[];
  currentCategory: WordFamilyCategory | null;
  rootWords: string[];
  currentWordFamily: WordFamilyData | null;
  savedIds: Set<string>;
  loading: boolean;
  error: string | null;
  lastFetched: Record<string, number>;  // TTL tracking
}

// TTL: 5 min, same pattern as useFlashcardSetStore
const FRESH_MS = 5 * 60 * 1000;
```

### API Client

```typescript
// kmaedu-fe/src/apis/wordFamilyApi.ts
export const getWordFamilyCategoriesApi = () => ...
export const getRootWordsApi = (slug: string) => ...
export const getWordFamilyApi = (rootWord: string) => ...
export const generateWordFamilyApi = (dto: GenerateDto) => ...
export const saveWordFamilyApi = (id: string) => ...
export const getSavedWordFamiliesApi = () => ...
export const createFlashcardFromWordFamilyApi = (dto: ToFlashcardDto) => ...
```

## Related Code Files

### Files to Create
- `kmaedu-fe/src/pages/k/word-family/` — page components
- `kmaedu-fe/src/components/k/word-family/` — UI components
- `kmaedu-fe/src/apis/wordFamilyApi.ts` — API client
- `kmaedu-fe/src/stores/useWordFamilyStore.ts` — Zustand store

### Files to Modify
- `kmaedu-fe/src/routes/index.tsx` — add routes
- `kmaedu-fe/src/types/` — add Word Family types

## Implementation Steps

1. **Read existing flashcard store** (`useFlashcardSetStore.ts`) — understand TTL pattern
2. **Create types** in `kmaedu-fe/src/types/word-family.ts`:
   - `WordFamilyCategory`, `WordFamilyData`, `WordFamilyWord`, `Affix`
3. **Create API client** `wordFamilyApi.ts`:
   - All API functions matching backend endpoints
   - Use existing `api.ts` Axios instance
4. **Create Zustand store** `useWordFamilyStore.ts`:
   - State: categories, currentCategory, rootWords, currentWordFamily, savedIds
   - Actions: fetchCategories, fetchRootWords, fetchWordFamily, generateWordFamily, saveWordFamily, createFlashcard
   - TTL cache: check `lastFetched[key]` before fetching
   - Invalidate: clear relevant cache keys on CUD
5. **Create `WordFamilyPage.tsx`**:
   - Grid layout with category cards
   - Fetch categories on mount (with cache)
6. **Create `WordFamilyCategoryPage.tsx`**:
   - List of root words with "Generate" button if empty
   - Click root word → navigate to detail
7. **Create `WordFamilyDetailPage.tsx`**:
   - Tree/List toggle state
   - Tree View: `react-d3-tree` with custom `WordFamilyNode`
   - List View: table with checkboxes
   - Hover/click: expand to show meaning + example
   - "Save" button + "Create Flashcard" button
8. **Create `WordFamilyTreeView.tsx`**:
   - `react-d3-tree` integration
   - Transform `WordFamilyData` to tree nodes
   - Custom node: word + POS, affix highlight
9. **Create `WordFamilyListView.tsx`**:
   - Table with columns: checkbox, word, POS, meaning
   - "Select All" button
   - Selected count display
10. **Create `CreateFlashcardModal.tsx`**:
    - Show selected words count
    - Deck name preview: "Gia đình từ: {rootWord}"
    - Create button → call API → show success toast
11. **Add routes** in `routes/index.tsx`:
    - `/k/word-family` → `WordFamilyPage`
    - `/k/word-family/:slug` → `WordFamilyCategoryPage`
    - `/k/word-family/:slug/:rootWord` → `WordFamilyDetailPage`
12. **Add types** to `types/index.ts` or create `types/word-family.ts`
13. **Test locally** — verify all pages load, tree/list toggle works

## Todo List

- [ ] Create Word Family types
- [ ] Create `wordFamilyApi.ts` API client
- [ ] Create `useWordFamilyStore.ts` Zustand store
- [ ] Create `WordFamilyPage.tsx` (category list)
- [ ] Create `WordFamilyCategoryPage.tsx` (root words)
- [ ] Create `WordFamilyDetailPage.tsx` (tree/list view)
- [ ] Create `WordFamilyTreeView.tsx` (react-d3-tree)
- [ ] Create `WordFamilyListView.tsx` (table with checkboxes)
- [ ] Create `CreateFlashcardModal.tsx`
- [ ] Add routes in `routes/index.tsx`
- [ ] Test locally

## Success Criteria

- Category list displays all active categories with images
- Root words list shows words from cache/DB
- Tree view renders with react-d3-tree, custom nodes show affix
- List view shows checkboxes, "Select All" works
- Tree/List toggle instant (no reload)
- Save button creates UserSavedWordFamily reference
- Create Flashcard modal creates valid FlashCardSet
- Zustand cache TTL 5 min working
- Cache invalidation on CUD operations

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| react-d3-tree performance with large tree | Medium | Medium | Lazy load branches, virtualize if >50 nodes |
| Cache stale data | Low | Low | TTL 5 min + manual invalidate |
| Flashcard modal state | Low | Medium | Reset state on close, optimistic update |

## Security Considerations

- All endpoints require Bearer token (handled by API client)
- No sensitive data in localStorage
- XSS prevention: HTML in flashcard content sanitized by TipTap editor (existing pattern)

## Next Steps

- Phase 5: Admin panel for Word Family category CRUD
- Phase 6: Seed data + integration testing
