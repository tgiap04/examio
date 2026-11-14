"use client";

import { useMemo } from "react";
import {
  generateAccessCode,
  getSharingSettings,
  searchUsersForWhitelist,
  updateSharingSettings,
} from "@/apis/flashcardSetApi";
import { SharingModal } from "./share/SharingModal";

interface ShareFlashcardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flashcardSetId: string;
  flashcardSetTitle: string;
}

/** Teacher dialog for a flashcard set: same parts and delta API as the quiz set dialog. */
export function ShareFlashcardModal({
  open,
  onOpenChange,
  flashcardSetId,
  flashcardSetTitle: _flashcardSetTitle,
}: ShareFlashcardModalProps) {
  const api = useMemo(
    () => ({
      get: () => getSharingSettings(flashcardSetId),
      update: (delta: Parameters<typeof updateSharingSettings>[1]) =>
        updateSharingSettings(flashcardSetId, delta),
      rotateCode: () => generateAccessCode(flashcardSetId),
      search: searchUsersForWhitelist,
    }),
    [flashcardSetId],
  );
  const shareUrl = `${window.location.origin}/study-flashcard/${flashcardSetId}`;

  return (
    <SharingModal
      open={open}
      onOpenChange={onOpenChange}
      title="Chia sẻ bộ thẻ"
      resourceId={flashcardSetId}
      shareUrl={shareUrl}
      api={api}
    />
  );
}
