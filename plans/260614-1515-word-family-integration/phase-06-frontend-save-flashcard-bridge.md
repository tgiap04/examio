# Phase 6: Frontend - Save to Collection + FlashCard Bridge

## Context
- Word Family store: `examio-fe/src/stores/useWordFamilyStore.ts` (created in Phase 5)
- Flashcard API: `examio-fe/src/apis/flashcardSetApi.ts`
- Flashcard store: `examio-fe/src/stores/useFlashcardSetStore.ts`
- Word Family API: `examio-fe/src/apis/wordFamilyApi.ts` (created in Phase 5)

## Overview
Add user actions to Word Family detail view: save individual words to personal collection, and create FlashCard decks from selected words. Includes collection page and flashcard bridge modal.

**Priority:** P1 | **Status:** pending | **Effort:** 4h

## Key Insights
- "Save" is reference-based (no data copy) — `UserWordFamily` links user to word
- FlashCard bridge creates new `FlashCardSet` + `FlashCard` records + join table links
- Follow existing modal patterns (same as flashcard label assignment modal)
- Collection page follows `/k/my-materials` pattern

## Requirements
- Save/unsaved toggle on each word in tree/list view (heart icon)
- Selection mode: checkbox on words → "Create FlashCard" action button
- FlashCard bridge modal: select target flashcard set OR create new one
- New deck name default: "Gia đình từ: [Root word]"
- Collection page: `/k/word-family/collection` — list all saved words
- Collection words grouped by root word for easy browsing

## Architecture

### New Route
```
/k/word-family/collection  → WordFamilyCollectionPage
```

### User Flow
```
Word Family Detail → Toggle save (heart icon) → saved to collection
Word Family Detail → Select words (checkbox) → "Create FlashCard" button
  → Modal: choose existing set OR create new
  → POST /api/word-family/create-flashcard
  → Navigate to /k/manage-flashcard-set/:id
```

### Component Additions
```
WordFamilyDetailPage (updated)
├── WordSaveButton (heart icon, toggle save state)
├── SelectionCheckbox (per word, hidden until selection mode)
├── SelectionToolbar (appears when words selected)
│   └── "Tạo FlashCard" button → opens FlashCardBridgeModal
│
FlashCardBridgeModal
├── SelectExistingSet (radio list of user's flashcard sets)
├── CreateNewSet (input for deck name, default: "Gia đình từ: [Root]")
└── ConfirmButton → calls createFlashcard API

WordFamilyCollectionPage
├── CollectionGroupList (grouped by root word)
│   └── CollectionGroup
│       ├── Root word header
│       └── WordCard (word, POS, meaning, remove button)
```

### Zustand Store Updates
```typescript
// Add to useWordFamilyStore
interface WordFamilyState {
  // ... from Phase 5
  selectedWordIds: Set<string>;
  selectionMode: boolean;
  
  // Actions
  toggleSaveWord: (wordId: string) => Promise<void>;
  toggleSelectionMode: () => void;
  selectWord: (wordId: string) => void;
  deselectWord: (wordId: string) => void;
  selectAllWords: (rootWordId: string) => void;
  clearSelection: () => void;
  createFlashcardFromSelection: (flashcardSetId?: string, title?: string) => Promise<string>;
}
```

## Files to Create
- `examio-fe/src/pages/k/WordFamilyCollectionPage.tsx`
- `examio-fe/src/components/organisms/word-family/WordSaveButton.tsx`
- `examio-fe/src/components/organisms/word-family/SelectionToolbar.tsx`
- `examio-fe/src/components/organisms/word-family/FlashCardBridgeModal.tsx`
- `examio-fe/src/components/organisms/word-family/CollectionGroupList.tsx`
- `examio-fe/src/components/organisms/word-family/CollectionGroup.tsx`
- `examio-fe/src/apis/wordFamilyApi.ts` — add save/collection/bridge endpoints

## Files to Modify
- `examio-fe/src/stores/useWordFamilyStore.ts` — add save/selection/bridge actions
- `examio-fe/src/apis/wordFamilyApi.ts` — add save/collection/bridge API calls
- `examio-fe/src/components/organisms/word-family/WordFamilyTreeView.tsx` — add save buttons + checkboxes
- `examio-fe/src/components/organisms/word-family/WordFamilyListView.tsx` — add save buttons + checkboxes
- `examio-fe/src/components/organisms/word-family/WordRow.tsx` — add save button + checkbox
- `examio-fe/src/routes/index.tsx` — add collection route

## Implementation Steps

1. Add API endpoints to `wordFamilyApi.ts`:
   - `saveWord(wordId)` — POST /api/word-family/words/:id/save
   - `removeWord(wordId)` — DELETE /api/word-family/words/:id/save
   - `getCollection(page, limit)` — GET /api/word-family/collection
   - `createFlashcard(wordFamilyIds, title?)` — POST /api/word-family/create-flashcard

2. Extend Zustand store:
   - `selectedWordIds: Set<string>` for selection mode
   - `toggleSaveWord()` — optimistic update + API call
   - `toggleSelectionMode()` — enter/exit selection mode
   - `selectWord()` / `deselectWord()` / `selectAllWords()` / `clearSelection()`
   - `createFlashcardFromSelection()` — calls API, returns new flashcard set ID

3. Create `WordSaveButton.tsx`:
   - Heart icon (filled if saved, outline if not)
   - Optimistic toggle on click
   - Tooltip: "Lưu vào bộ sưu tập" / "Bỏ lưu"

4. Create `SelectionToolbar.tsx`:
   - Fixed bottom bar when selection mode active
   - Shows count of selected words
   - "Tạo FlashCard" button → opens modal
   - "Hủy" button → exits selection mode

5. Create `FlashCardBridgeModal.tsx`:
   - Two options: create new set or add to existing
   - New set: input with default name "Gia đình từ: [Root word]"
   - Existing: radio list of user's flashcard sets (fetched from flashcard API)
   - Confirm button → calls `createFlashcardFromSelection()`
   - On success → navigate to `/k/manage-flashcard-set/:newId`

6. Update tree/list views to include:
   - `WordSaveButton` on each word
   - `SelectionCheckbox` in selection mode
   - Long-press or button to enter selection mode

7. Create `WordFamilyCollectionPage.tsx`:
   - Fetch user collection on mount
   - Group words by root word
   - Each group shows root word header + list of saved words
   - Remove button on each word to unsaved

8. Add collection route to `index.tsx`

## Todo
- [ ] Add save/collection/bridge endpoints to wordFamilyApi.ts
- [ ] Extend useWordFamilyStore with save/selection/bridge actions
- [ ] Create WordSaveButton.tsx
- [ ] Create SelectionToolbar.tsx
- [ ] Create FlashCardBridgeModal.tsx
- [ ] Update WordFamilyTreeView with save buttons + checkboxes
- [ ] Update WordFamilyListView with save buttons + checkboxes
- [ ] Update WordRow.tsx with save button + checkbox
- [ ] Create WordFamilyCollectionPage.tsx
- [ ] Create CollectionGroupList.tsx and CollectionGroup.tsx
- [ ] Add collection route to index.tsx
- [ ] Test save/unsave flow end-to-end
- [ ] Test flashcard bridge end-to-end
- [ ] Test collection page display

## Success Criteria
- Heart icon toggles save state with optimistic update
- Selection mode shows checkboxes on all words
- "Tạo FlashCard" button opens modal with new/existing set options
- Creating flashcard set navigates to manage-flashcard-set page
- Collection page shows saved words grouped by root word
- Remove from collection works with confirmation
- No N+1 queries (batch save operations)

## Risk Assessment
- FlashCard bridge could create large sets (50+ cards) → batch in transaction, show progress
- Optimistic updates could desync → revert on API error with toast notification
- Collection page could be slow with many saved words → paginate, virtual scroll if >100

## Security Considerations
- All save/remove operations verify user ownership
- FlashCard bridge checks subscription status (same as Phase 4)
- Collection data is user-scoped (no cross-user access)

## Next Steps
- Phase 7: Admin page (can run in parallel)
- Phase 8: Integration testing
