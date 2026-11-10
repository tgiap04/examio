# Plan: Flashcard Label View Modal + Modal Width + Scroll Position Fix

## Mục tiêu
Fix và refactor 3 vấn đề trong trang `ManageFlashcardSetDetailPage`:
1. Khi click xem flashcards trong label → mở modal xem (theo mẫu quiz-set)
2. Khi chỉnh sửa flashcard → modal rộng hơn (tăng width)
3. Sau khi lưu flashcard → giữ nguyên vị trí câu hỏi (không nhảy xuống cuối trang)

## Phases

### Phase 1: Add Flashcard View Modal in FlashcardLabelManager
- File: `kmaedu-fe/src/components/organisms/FlashcardLabelManager.tsx`
- Thêm state `viewFlashcard` + `isViewDialogOpen` để xem chi tiết flashcard (read-only)
- Thêm nút Eye icon ở mỗi flashcard trong danh sách label
- Thêm Dialog hiển thị question/answer bằng `RichTextViewer`

### Phase 2: Increase FlashcardEditorDialog Width
- File: `kmaedu-fe/src/components/organisms/FlashcardEditorDialog.tsx`
- Tăng `max-w-4xl` → `max-w-[900px]` (tương đương ~75rem)
- Thêm `modalWidth={900}` prop vào DialogContent

### Phase 3: Fix Scroll Position After Save
- File: `kmaedu-fe/src/pages/k/ManageFlashcardSetDetailPage.tsx`
- Xóa `window.scrollTo({ top: 0 })` ở `handleEditCard` và `handleAddCard`
- Thêm `scrollPositionRef` để track scroll Y trước khi mở form
- Sau `fetchFlashcards()` → `window.scrollTo({ top: scrollY, behavior: "instant" })`

## Files to Modify
- `kmaedu-fe/src/components/organisms/FlashcardLabelManager.tsx`
- `kmaedu-fe/src/components/organisms/FlashcardEditorDialog.tsx`
- `kmaedu-fe/src/pages/k/ManageFlashcardSetDetailPage.tsx`

## Status: `completed`

## Verification

### Phase 1: FlashcardLabelManager.tsx -- DONE
- `viewFlashcard` + `isViewDialogOpen` state added (lines 79-80)
- `Eye` icon imported from lucide-react (line 26)
- Eye button renders at each flashcard row (line 432)
- `RichTextViewer` renders question (line 441) and answer (line 449) in read-only view
- `Dialog` wraps the viewer (line 462), shows label name with color badge (lines 467-476)

### Phase 2: FlashcardEditorDialog.tsx -- DONE
- `max-w-4xl` replaced with `max-w-[900px]` (line 138)
- `modalWidth={900}` prop passed to DialogContent (line 143)

### Phase 3: ManageFlashcardSetDetailPage.tsx -- DONE
- `scrollPositionRef` added (line 68)
- `window.scrollY` captured on handleAddCard (line 117) and handleEditCard (line 123)
- `window.scrollTo({ top: scrollY, behavior: "instant" })` called after fetchFlashcards (line 161)
- No `window.scrollTo({ top: 0 })` remains on edit/add paths
