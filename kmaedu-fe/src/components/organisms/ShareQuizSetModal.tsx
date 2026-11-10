"use client";

import { useMemo } from "react";
import {
  generateQuizSetCodeApi,
  getQuizSetSharingApi,
  searchQuizSetUsersApi,
  updateQuizSetSharingApi,
} from "@/apis/quizsetApi";
import { SharingModal } from "./share/SharingModal";

interface ShareQuizSetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quizSetId: string;
}

/** Teacher dialog: public toggle, whitelist, invite code, and the practice link for students. */
export function ShareQuizSetModal({ open, onOpenChange, quizSetId }: ShareQuizSetModalProps) {
  const api = useMemo(
    () => ({
      get: () => getQuizSetSharingApi(quizSetId),
      update: (delta: Parameters<typeof updateQuizSetSharingApi>[1]) =>
        updateQuizSetSharingApi(quizSetId, delta),
      rotateCode: () => generateQuizSetCodeApi(quizSetId),
      search: searchQuizSetUsersApi,
    }),
    [quizSetId],
  );
  const shareUrl = `${window.location.origin}/k/practice-quiz/${quizSetId}`;

  return (
    <SharingModal
      open={open}
      onOpenChange={onOpenChange}
      title="Chia sẻ bộ câu hỏi"
      resourceId={quizSetId}
      shareUrl={shareUrl}
      api={api}
    />
  );
}
