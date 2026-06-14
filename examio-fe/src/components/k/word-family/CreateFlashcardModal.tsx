import { useState } from "react";
import { Modal } from "antd";
import { useNavigate } from "react-router-dom";
import { useWordFamilyStore } from "@/stores/useWordFamilyStore";
import { toast } from "@/components/antd/toast";

interface CreateFlashcardModalProps {
  open: boolean;
  wordFamilyId: string;
  rootWord: string;
  selectedCount: number;
  selectedIndices: number[];
  onClose: () => void;
}

/**
 * Modal to confirm flashcard deck creation from selected words.
 */
export function CreateFlashcardModal({
  open,
  wordFamilyId,
  rootWord,
  selectedCount,
  selectedIndices,
  onClose,
}: CreateFlashcardModalProps) {
  const { createFlashcard } = useWordFamilyStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const result = await createFlashcard(wordFamilyId, selectedIndices);
      if (result) {
        toast.success(
          `Đã tạo bộ flashcard "Gia đình từ: ${rootWord}" với ${result.cardCount} thẻ.`,
        );
        onClose();
        navigate(`/k/manage-flashcard-set/${result.flashCardSetId}`);
      } else {
        toast.error("Tạo flashcard thất bại");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Tạo bộ Flashcard"
      open={open}
      onOk={handleCreate}
      onCancel={onClose}
      okText="Tạo"
      cancelText="Hủy"
      confirmLoading={loading}
    >
      <div className="space-y-2 text-sm">
        <p>
          Tạo bộ flashcard từ <strong>{selectedCount}</strong> từ đã chọn:
        </p>
        <p className="rounded-md bg-canvas px-3 py-2 text-ink/70">
          Tên deck: <strong>Gia đình từ: {rootWord}</strong>
        </p>
        <p className="text-xs text-ink/50">
          Deck sẽ được thêm vào mục Quản lý Flashcard của bạn.
        </p>
      </div>
    </Modal>
  );
}
