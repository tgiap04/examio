"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/antd/dialog";
import { Button } from "@/components/antd/button";
import { Badge } from "@/components/antd/badge";
import { Label } from "@/components/antd/label";
import { RichTextViewer } from "@/components/molecules/RichTextViewer";
import { Flashcard } from "@/types/flashcardSet";

interface ViewFlashcardDialogProps {
  flashcard: Flashcard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ViewFlashcardDialog({
  flashcard,
  open,
  onOpenChange,
}: ViewFlashcardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Xem thẻ ghi nhớ</DialogTitle>
          <DialogDescription>
            Xem chi tiết nội dung mặt trước và mặt sau của thẻ ghi nhớ
          </DialogDescription>
        </DialogHeader>
        {flashcard?.label?.name && (
          <div className="-mt-2 mb-2">
            <Badge
              variant="secondary"
              className="text-xs"
              style={{
                backgroundColor: flashcard.label.color
                  ? `${flashcard.label.color}20`
                  : undefined,
                borderColor: flashcard.label.color || undefined,
                color: flashcard.label.color || undefined,
              }}
            >
              {flashcard.label.name}
            </Badge>
          </div>
        )}
        <div className="space-y-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              Mặt trước (Câu hỏi)
            </Label>
            <div className="rounded-lg border bg-background p-4 min-h-[120px]">
              <RichTextViewer content={flashcard?.question || ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              Mặt sau (Câu trả lời)
            </Label>
            <div className="rounded-lg border bg-background p-4 min-h-[120px]">
              <RichTextViewer content={flashcard?.answer || ""} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
