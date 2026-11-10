# Phase 5: Frontend - Category List + Tree/List Toggle UI

## Context
- FE routes: `kmaedu-fe/src/routes/index.tsx`
- Flashcard page reference: `kmaedu-fe/src/pages/k/FlashcardsPage.tsx`
- Store pattern: `kmaedu-fe/src/stores/useFlashcardSetStore.ts`
- API pattern: `kmaedu-fe/src/apis/flashcardSetApi.ts`
- Tree library: `react-d3-tree` (new dependency)

## Overview
Build the Word Family browsing experience: category grid → word family tree/list toggle view. Includes Zustand store with TTL cache, API client, and two view modes.

**Priority:** P1 | **Status:** pending | **Effort:** 6h

## Key Insights
- Follow existing page pattern: `KLayout` → page component → Zustand store → API client
- Zustand TTL cache: 5min, same pattern as `useFlashcardSetStore`
- Tree view uses `react-d3-tree` — need to transform flat word data into tree hierarchy
- List view is simpler — table/cards with affix highlighting
- Categories page is public-facing (within `/k/` protected route)

## Requirements
- Category grid: show 10 categories with thumbnail images, Vietnamese names
- Click category → generate/load words (show loading spinner during AI generation)
- Tree view: root word as parent node, family words as children with POS badges
- List view: table with columns for word, POS, meaning, example, affix breakdown
- Toggle button between tree and list views (persist in localStorage)
- Affix highlighting: prefix/root/suffix colored differently in word display
- Responsive: grid adapts to mobile (2 cols) / tablet (3 cols) / desktop (4 cols)

## Architecture

### Routes
```
/k/word-family              → WordFamilyPage (category grid)
/k/word-family/:categoryId  → WordFamilyDetailPage (tree/list view)
```

### Zustand Store: `useWordFamilyStore`
```typescript
interface WordFamilyState {
  categories: WordFamilyCategory[];
  currentWords: WordFamilyRootWord[] | null;
  viewMode: 'tree' | 'list';
  isLoadingCategories: boolean;
  isGenerating: boolean;
  collection: WordFamilyWord[];
  
  // TTL cache
  categoriesCache: { data: WordFamilyCategory[]; timestamp: number } | null;
  wordsCache: Map<string, { data: WordFamilyRootWord[]; timestamp: number }>;
  
  // Actions
  fetchCategories: () => Promise<void>;
  fetchOrGenerateWords: (categoryId: string, numRoots?: number) => Promise<void>;
  setViewMode: (mode: 'tree' | 'list') => void;
  toggleViewMode: () => void;
}
```

### Tree Data Transformation
```typescript
// Flat → Tree for react-d3-tree
function transformToTreeData(roots: WordFamilyRootWord[]): TreeNode {
  return {
    name: 'Word Families',
    children: roots.map(root => ({
      name: root.word,
      attributes: { meaning: root.meaning },
      children: root.words.map(word => ({
        name: word.word,
        attributes: { pos: word.pos, meaningVi: word.meaningVi },
      })),
    })),
  };
}
```

### Component Tree
```
WordFamilyPage
├── CategoryGrid
│   └── CategoryCard (thumbnail + name + description)
│
WordFamilyDetailPage
├── ViewToggle (tree/list button)
├── TreeView (react-d3-tree, hidden when listMode)
│   └── CustomNodeRenderer (POS badge + affix colors)
├── ListView (table, hidden when treeMode)
│   └── WordRow (word + POS badge + meaning + example + affix breakdown)
└── GenerateMoreButton (load additional roots)
```

## Files to Create
- `kmaedu-fe/src/pages/k/WordFamilyPage.tsx`
- `kmaedu-fe/src/pages/k/WordFamilyDetailPage.tsx`
- `kmaedu-fe/src/components/organisms/word-family/CategoryGrid.tsx`
- `kmaedu-fe/src/components/organisms/word-family/CategoryCard.tsx`
- `kmaedu-fe/src/components/organisms/word-family/WordFamilyTreeView.tsx`
- `kmaedu-fe/src/components/organisms/word-family/WordFamilyListView.tsx`
- `kmaedu-fe/src/components/organisms/word-family/WordRow.tsx`
- `kmaedu-fe/src/components/organisms/word-family/AffixDisplay.tsx`
- `kmaedu-fe/src/components/organisms/word-family/ViewToggle.tsx`
- `kmaedu-fe/src/apis/wordFamilyApi.ts`
- `kmaedu-fe/src/stores/useWordFamilyStore.ts`
- `kmaedu-fe/src/types/wordFamily.ts`

## Files to Modify
- `kmaedu-fe/src/routes/index.tsx` — add 2 new routes

## Implementation Steps

1. Install `react-d3-tree`: `cd kmaedu-fe && yarn add react-d3-tree`
2. Create TypeScript types in `types/wordFamily.ts`
3. Create API client `wordFamilyApi.ts`:
   - `getCategories()` — GET /api/word-family/categories
   - `getCategoryWords(categoryId, numRoots?)` — GET /api/word-family/categories/:id/words
   - `getWordDetail(wordId)` — GET /api/word-family/words/:id
4. Create Zustand store `useWordFamilyStore.ts`:
   - TTL cache logic (5min)
   - `fetchCategories()` with cache check
   - `fetchOrGenerateWords()` with cache check + loading state
   - `viewMode` persisted to localStorage
5. Create `WordFamilyPage.tsx`:
   - Fetch categories on mount
   - Grid layout with `CategoryGrid` + `CategoryCard`
   - Navigate to detail page on card click
6. Create `WordFamilyDetailPage.tsx`:
   - Fetch/generate words on mount
   - Toggle between `WordFamilyTreeView` and `WordFamilyListView`
   - Loading state during AI generation
7. Create `WordFamilyTreeView.tsx`:
   - Use `react-d3-tree` with custom node renderer
   - Transform flat data to tree hierarchy
   - Custom node shows POS badge + affix coloring
8. Create `WordFamilyListView.tsx`:
   - Table/card layout with word, POS, meaning, example
   - `AffixDisplay` component highlights prefix/root/suffix
9. Create `AffixDisplay.tsx`:
   - Colored spans: prefix (blue), root (green), suffix (orange)
   - Example: `<span class="text-blue">re</span><span class="text-green">act</span><span class="text-orange">ion</span>`
10. Add routes to `index.tsx`
11. Test responsive layout on mobile/tablet/desktop

## Todo
- [ ] Install react-d3-tree dependency
- [ ] Create wordFamily types
- [ ] Create wordFamilyApi.ts
- [ ] Create useWordFamilyStore.ts with TTL cache
- [ ] Create WordFamilyPage.tsx (category grid)
- [ ] Create CategoryGrid.tsx and CategoryCard.tsx
- [ ] Create WordFamilyDetailPage.tsx
- [ ] Create WordFamilyTreeView.tsx with react-d3-tree
- [ ] Create WordFamilyListView.tsx
- [ ] Create AffixDisplay.tsx
- [ ] Create ViewToggle.tsx
- [ ] Add routes to index.tsx
- [ ] Test responsive layout
- [ ] Test tree/list toggle persistence

## Success Criteria
- Category grid displays 10 categories with images and Vietnamese names
- Clicking category triggers AI generation (shows loading) or loads from cache
- Tree view renders root words as parent nodes, family words as children
- List view shows word, POS, meaning, example in table format
- Affix highlighting works (prefix/root/suffix colors)
- Toggle persists across page refreshes (localStorage)
- Responsive: 2 cols mobile, 3 cols tablet, 4 cols desktop
- Zustand TTL cache prevents redundant API calls within 5min

## Risk Assessment
- react-d3-tree may have rendering issues on mobile → test with large datasets, add zoom controls
- AI generation timeout on slow connection → show retry button after 60s
- Large word families (50+ words) may slow tree rendering → limit initial load to 10 roots, load more on demand

## Security Considerations
- Word Family pages behind `ProtectedRoute` (existing pattern)
- API calls use existing Axios instance with bearer token
- No new auth flows needed

## Next Steps
- Phase 6: Save to collection + flashcard bridge UI
- Phase 7: Admin page (can run in parallel)
