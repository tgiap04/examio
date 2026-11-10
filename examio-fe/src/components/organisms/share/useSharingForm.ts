import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/antd/toast";
import {
  ApiFailure,
  SHARE_LIST_FULL_MESSAGE,
  isFailure,
} from "@/lib/quiz-practice/api-failure";
import type {
  SharingDelta,
  SharingSearchUser,
  SharingView,
} from "@/lib/quiz-practice/sharing-types";
import {
  NO_WHITELIST_CHANGE,
  buildSharingDelta,
  type WhitelistChange,
} from "./sharing-delta";

/** What a resource (quiz set, flashcard set) must offer to be shared with this form. */
export interface SharingApi {
  get: () => Promise<SharingView>;
  update: (delta: SharingDelta) => Promise<SharingView>;
  rotateCode: () => Promise<{ accessCode: string }>;
  search: (query: string) => Promise<SharingSearchUser[]>;
}

/** Edit state for one sharing dialog; `save` sends ONE delta with only what changed. */
export function useSharingForm(api: SharingApi, open: boolean, resourceId: string) {
  const [saved, setSaved] = useState<SharingView | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [codeEnabled, setCodeEnabled] = useState(false);
  const [whitelist, setWhitelist] = useState<WhitelistChange>(NO_WHITELIST_CHANGE);
  const [removedCodeGranted, setRemovedCodeGranted] = useState<string[]>([]);

  const adopt = useCallback((view: SharingView) => {
    setSaved(view);
    setIsPublic(view.isPublic);
    setCodeEnabled(view.accessCode !== null);
    setWhitelist(NO_WHITELIST_CHANGE);
    setRemovedCodeGranted([]);
  }, []);

  useEffect(() => {
    if (!open || !resourceId) return;
    let cancelled = false;
    setLoading(true);
    api
      .get()
      .then((view) => !cancelled && adopt(view))
      .catch(() => toast.error("Không thể tải cài đặt chia sẻ"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, resourceId, api, adopt]);

  const delta = saved
    ? buildSharingDelta(saved, { isPublic, codeEnabled, whitelist, removedCodeGranted })
    : null;

  const fail = (error: unknown, fallback: string) => {
    if (isFailure(error, "SHARE_LIST_FULL")) toast.error(SHARE_LIST_FULL_MESSAGE);
    else toast.error(error instanceof ApiFailure || error instanceof Error ? error.message : fallback);
  };

  const save = async (): Promise<boolean> => {
    if (!delta) return true;
    setBusy(true);
    try {
      adopt(await api.update(delta));
      toast.success("Đã lưu cài đặt chia sẻ");
      return true;
    } catch (error) {
      fail(error, "Không thể lưu cài đặt chia sẻ");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      const { accessCode } = await api.rotateCode();
      setSaved((prev) => prev && { ...prev, accessCode, codeGranted: [] });
      setRemovedCodeGranted([]);
      toast.success("Đã tạo mã mới");
    } catch (error) {
      fail(error, "Không thể tạo mã mới");
    } finally {
      setBusy(false);
    }
  };

  const toggleRemoveCodeGranted = (id: string) =>
    setRemovedCodeGranted((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return {
    saved,
    loading,
    busy,
    dirty: delta !== null,
    isPublic,
    setIsPublic,
    codeEnabled,
    setCodeEnabled,
    whitelist,
    setWhitelist,
    removedCodeGranted,
    toggleRemoveCodeGranted,
    save,
    regenerate,
  };
}
