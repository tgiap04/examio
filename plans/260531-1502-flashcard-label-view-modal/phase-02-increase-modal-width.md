# Phase 2: Increase FlashcardEditorDialog Width

## Context
- File: `examio-fe/src/components/organisms/FlashcardEditorDialog.tsx`
- Reference: `FlashcardEditorDialog` hiện dùng `max-w-4xl` (64rem = ~1024px)
- Cần tăng width cho thoáng hơn khi chỉnh sửa flashcard

## Overview
Tăng max-width của DialogContent để form flashcard thoáng hơn, tương tự cách quiz-set editor dùng inline expansion.

## Changes

### 1. Cập nhật DialogContent trong nhánh `isDesktop`
```tsx
// Trước:
<DialogContent className="!max-w-4xl max-h-[90vh] overflow-y-auto">

// Sau:
<DialogContent
  className="!max-w-[900px] max-h-[90vh] overflow-y-auto"
  modalWidth={900}
>
```

### 2. Cập nhật DialogContent trong nhánh mobile (Drawer fallback)
Drawer giữ nguyên không cần thay đổi vì đã full-width trên mobile.

## Success Criteria
- Modal desktop rộng hơn đáng kể (~900px)
- RichTextEditor có không gian thoáng hơn để nhập nội dung dài
- Mobile fallback vẫn hoạt động bình thường
