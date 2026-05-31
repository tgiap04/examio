"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/antd/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/antd/drawer";
import { Button } from "@/components/antd/button";
import { Label } from "@/components/antd/label";
import { RichTextEditor } from "@/components/molecules/RichTextEditor";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Flashcard } from "@/types/flashcardSet";

interface FlashcardEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flashcard: Flashcard | null;
  onSave: (data: FlashcardFormData) => void;
}

export interface FlashcardFormData {
  question: string;
  answer: string;
}

export function FlashcardEditorDialog({
  open,
  onOpenChange,
  flashcard,
  onSave,
}: FlashcardEditorDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef<FlashcardFormData | null>(null);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Initialize form when dialog opens
  useEffect(() => {
    if (open) {
      if (flashcard) {
        setQuestion(flashcard.question);
        setAnswer(flashcard.answer);
      } else {
        setQuestion("");
        setAnswer("");
      }
    }
  }, [open, flashcard]);

  // Handle save when dialog closes
  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // Execute pending save after dialog animation
  useEffect(() => {
    if (!open && pendingSaveRef.current && isSavingRef.current) {
      isSavingRef.current = false;
      const data = pendingSaveRef.current;
      pendingSaveRef.current = null;
      onSave(data);
    }
  }, [open, onSave]);

  const handleSave = useCallback(() => {
    if (!question.trim()) {
      alert("Vui lòng nhập mặt trước của thẻ");
      return;
    }

    if (!answer.trim()) {
      alert("Vui lòng nhập mặt sau của thẻ");
      return;
    }

    if (isSavingRef.current) return;

    // Mark as saving and store data
    isSavingRef.current = true;
    pendingSaveRef.current = { question: question.trim(), answer: answer.trim() };
    setIsSaving(true);

    // Close the dialog
    onOpenChange(false);
  }, [question, answer, onOpenChange]);

  const handleCancel = useCallback(() => {
    if (isSavingRef.current) return;
    onOpenChange(false);
  }, [onOpenChange]);

  const formContent = (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="question">
          Mặt trước <span className="text-destructive">*</span>
        </Label>
        <RichTextEditor
          content={question}
          onChange={setQuestion}
          placeholder="Nhập câu hỏi hoặc thuật ngữ..."
          minHeight="150px"
          disabled={isSaving}
        />
        <p className="text-xs text-muted-foreground">
          💡 Gợi ý: Sử dụng nút 🖼️ trên toolbar để chèn hình ảnh từ URL
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="answer">
          Mặt sau <span className="text-destructive">*</span>
        </Label>
        <RichTextEditor
          content={answer}
          onChange={setAnswer}
          placeholder="Nhập câu trả lời hoặc định nghĩa..."
          minHeight="180px"
          disabled={isSaving}
        />
        <p className="text-xs text-muted-foreground">
          💡 Sử dụng các nút định dạng để làm nổi bật nội dung
        </p>
      </div>

      <div className="flex gap-2 justify-end pt-4">
        <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
          Hủy
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Đang lưu..." : flashcard ? "Cập nhật" : "Thêm thẻ"}
        </Button>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          className="!max-w-[900px] max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:w-0.5
  [&::-webkit-scrollbar-track]:bg-gray-100
  [&::-webkit-scrollbar-thumb]:bg-gray-300"
          modalWidth={900}
        >
          <DialogHeader>
            <DialogTitle>
              {flashcard ? "Chỉnh sửa thẻ nhớ" : "Thêm thẻ nhớ mới"}
            </DialogTitle>
            <DialogDescription>
              Nhập nội dung cho mặt trước và mặt sau của thẻ nhớ
            </DialogDescription>
          </DialogHeader>
          {formContent}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent className="max-h-[90vh] px-4 pb-8">
        <DrawerHeader>
          <DrawerTitle>
            {flashcard ? "Chỉnh sửa thẻ nhớ" : "Thêm thẻ nhớ mới"}
          </DrawerTitle>
          <DrawerDescription>
            Nhập nội dung cho mặt trước và mặt sau của thẻ nhớ
          </DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-1 pb-4">{formContent}</div>
      </DrawerContent>
    </Drawer>
  );
}
