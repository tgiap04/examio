# Phase 1: Add Flashcard View Modal in FlashcardLabelManager

## Context
- File: `kmaedu-fe/src/components/organisms/FlashcardLabelManager.tsx`
- Reference: Quiz-set page (`ManageQuizSetDetailPage.tsx`) — khi click xem câu hỏi trong label thì mở modal

## Overview
Thêm Dialog hiển thị chi tiết flashcard (read-only) khi user click nút "Eye" ở mỗi flashcard trong phần "Thẻ ghi nhớ trong nhãn".

## Changes

### 1. Import thêm
```tsx
import { Flashcard } from "@/types/flashcardSet";
import { Eye } from "lucide-react";
```

### 2. Thêm state mới
```tsx
const [viewFlashcard, setViewFlashcard] = useState<Flashcard | null>(null);
const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
```

### 3. Thêm hàm handler
```tsx
const handleViewFlashcard = (flashcard: Flashcard) => {
  setViewFlashcard(flashcard);
  setIsViewDialogOpen(true);
};
```

### 4. Thêm View Dialog (trước `Edit Label Dialog`)
```tsx
<Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
  <DialogContent className="!max-w-2xl max-h-[85vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>Xem thẻ ghi nhớ</DialogTitle>
      <DialogDescription>
        {viewFlashcard?.label?.name && (
          <Badge variant="secondary" className="mt-1"
            style={{
              backgroundColor: viewFlashcard.label.color ? `${viewFlashcard.label.color}20` : undefined,
              borderColor: viewFlashcard.label.color || undefined,
              color: viewFlashcard.label.color || undefined,
            }}
          >
            {viewFlashcard.label.name}
          </Badge>
        )}
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-sm font-medium text-muted-foreground">Mặt trước (Câu hỏi)</Label>
        <div className="rounded-lg border bg-background p-4 min-h-[120px]">
          <RichTextViewer content={viewFlashcard?.question || ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-medium text-muted-foreground">Mặt sau (Câu trả lời)</Label>
        <div className="rounded-lg border bg-background p-4 min-h-[120px]">
          <RichTextViewer content={viewFlashcard?.answer || ""} />
        </div>
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Đóng</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 5. Thêm nút Eye vào mỗi flashcard trong danh sách label
Trong `labelFlashcards.map()`, thêm:
```tsx
<div className="flex items-center justify-between mb-2">
  <span className="text-sm font-medium text-muted-foreground">{index + 1}.</span>
  <Button variant="ghost" size="sm" onClick={() => handleViewFlashcard(flashcard)}>
    <Eye className="h-4 w-4" />
  </Button>
</div>
```

## Success Criteria
- Click icon Eye → mở modal hiển thị chi tiết flashcard (read-only)
- Modal có 2 fields: Mặt trước và Mặt sau dùng RichTextViewer
- Nút "Đóng" để đóng modal
- Badge hiển thị label nếu có
