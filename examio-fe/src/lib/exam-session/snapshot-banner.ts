export interface SnapshotDrift {
  /** null = content service could not answer: show nothing. */
  snapshotOutdated?: boolean | null;
  canRefreshSnapshot?: boolean;
}

export interface SnapshotBannerState {
  show: boolean;
  showButton: boolean;
}

/** Banner only when the snapshot is known to be outdated; button only when the server says a refresh is allowed. */
export function snapshotBannerState(drift: SnapshotDrift, canManage: boolean): SnapshotBannerState {
  const show = drift.snapshotOutdated === true;
  return { show, showButton: show && canManage && drift.canRefreshSnapshot === true };
}

/** User-facing message for the 422s of POST /examsessions; null for any other code. */
export function createSessionErrorMessage(code: string | undefined): string | null {
  if (code === "QUIZSET_DELETED") return "Bộ đề của phòng thi này đã bị xóa, không thể tạo phiên thi mới";
  if (code === "QUIZSET_TOO_LARGE") return "Bộ đề quá lớn để tạo phiên thi, hãy giảm số câu hỏi hoặc dung lượng";
  return null;
}
