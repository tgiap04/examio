# Phase 3: Fix Scroll Position After Save

## Context
- File: `kmaedu-fe/src/pages/k/ManageFlashcardSetDetailPage.tsx`
- Reference: Quiz-set page (`ManageQuizSetDetailPage.tsx`) — sau khi lưu câu hỏi, trang KHÔNG scroll to top, giữ nguyên vị trí

## Problem
Hiện tại `handleEditCard` và `handleAddCard` đều gọi:
```tsx
window.scrollTo({ top: 0, behavior: "smooth" });
```
Sau khi save xong (`handleSaveCard`), `fetchFlashcards()` được gọi → re-render → scroll nhảy về đầu trang.

## Quiz-set approach (reference)
Quiz-set KHÔNG scroll to top khi edit. Sau khi save, `fetchQuestions()` được gọi trong khi inline editor đã đóng. Quiz-set dùng `InlineQuestionEditor` inline trong danh sách (không modal), nên vấn đề scroll position khác.

Vấn đề chính ở flashcard là:
1. `window.scrollTo` ở `handleEditCard` và `handleAddCard`
2. Sau save → `fetchFlashcards()` re-fetch tất cả flashcards → vị trí bị reset

## Solution

### 1. Xóa `window.scrollTo` ở `handleEditCard` và `handleAddCard`
```tsx
// Xóa dòng này khỏi cả hai handler:
window.scrollTo({ top: 0, behavior: "smooth" });
```

### 2. Thêm `useRef` để track scroll position
```tsx
const scrollPositionRef = useRef<number>(0);
```

### 3. Cập nhật `handleEditCard` để lưu scroll position
```tsx
const handleEditCard = useCallback((card: FlashCard) => {
  scrollPositionRef.current = window.scrollY;
  setSelectedCard(card);
  setShowCardForm(true);
}, []);
```

### 4. Cập nhật `handleSaveCard` để restore scroll position
```tsx
const handleSaveCard = useCallback(
  async (cardData: any) => {
    if (!id) return;

    const scrollY = scrollPositionRef.current;

    if (selectedCard) {
      await updateFlashcard(id, selectedCard.id, cardData);
    } else {
      await addFlashcard(id, cardData);
    }
    setShowCardForm(false);
    setSelectedCard(null);

    // Fetch xong thì restore scroll position
    await fetchFlashcards();
    window.scrollTo({ top: scrollY, behavior: "instant" });
  },
  [selectedCard, id, addFlashcard, updateFlashcard, fetchFlashcards],
);
```

### 5. Tương tự cho `handleAddCard` (không cần scroll restore vì thêm mới → có thể muốn scroll lên đầu để thấy form, nhưng để giữ UX đồng nhất → xóa scrollTo)
```tsx
const handleAddCard = useCallback(() => {
  scrollPositionRef.current = window.scrollY;
  setSelectedCard(null);
  setShowCardForm(true);
}, []);
```

## Success Criteria
- Sau khi chỉnh sửa và lưu flashcard → trang giữ nguyên vị trí scroll
- Sau khi thêm flashcard mới → trang giữ nguyên vị trí scroll
- UX tương tự quiz-set
