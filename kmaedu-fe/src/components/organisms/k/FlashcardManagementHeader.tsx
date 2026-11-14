import { memo } from "react";
import { Button } from "@/components/antd/button";
import { Plus } from "lucide-react";

interface FlashcardManagementHeaderProps {
  onCreateFlashcard: () => void;
}

const FlashcardManagementHeaderComponent = ({
  onCreateFlashcard,
}: FlashcardManagementHeaderProps) => {
  return (
    <div className="flex items-start justify-between mb-8 mt-4">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-ink">Quản lý Flashcard</h1>
        <p className="text-xs text-muted-foreground md:text-sm">
          Tạo, chỉnh sửa và quản lý các bộ thẻ học flashcard của bạn
        </p>
      </div>
      <Button onClick={onCreateFlashcard}>
        <Plus className="h-4 w-4 mr-2" />
        Tạo flashcard
      </Button>
    </div>
  );
};

FlashcardManagementHeaderComponent.displayName = "FlashcardManagementHeader";

export const FlashcardManagementHeader = memo(FlashcardManagementHeaderComponent);
