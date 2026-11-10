"use client";

import { Copy, Globe, Link2, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/antd/dialog";
import { Button } from "@/components/antd/button";
import { Input } from "@/components/antd/input";
import { Label } from "@/components/antd/label";
import { Switch } from "@/components/antd/switch";
import { toast } from "@/components/antd/toast";
import { AccessCodeSection } from "./AccessCodeSection";
import { CodeGrantedList } from "./CodeGrantedList";
import { WhitelistUserPicker } from "./WhitelistUserPicker";
import { useSharingForm, type SharingApi } from "./useSharingForm";

interface SharingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  resourceId: string;
  /** Link students open (copied as is). */
  shareUrl: string;
  /** Must be referentially stable (module-level or memoised): it keys the data load. */
  api: SharingApi;
}

/** Public / whitelist / invite-code dialog shared by quiz sets and flashcard sets. */
export function SharingModal({ open, onOpenChange, title, resourceId, shareUrl, api }: SharingModalProps) {
  const form = useSharingForm(api, open, resourceId);

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    toast.success("Đã sao chép liên kết");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {form.loading || !form.saved ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Liên kết chia sẻ</Label>
              <div className="flex gap-2">
                <Input value={shareUrl} readOnly className="flex-1" />
                <Button variant="outline" size="icon" onClick={copyLink} title="Sao chép liên kết">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-2">
                  {form.isPublic ? (
                    <Globe className="h-4 w-4 text-green-600" />
                  ) : (
                    <Lock className="h-4 w-4 text-orange-600" />
                  )}
                  {form.isPublic ? "Công khai" : "Riêng tư"}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {form.isPublic
                    ? "Ai có liên kết cũng mở được. Danh sách và mã bên dưới vẫn được giữ lại."
                    : "Chỉ người trong danh sách hoặc người có mã mới mở được"}
                </p>
              </div>
              <Switch checked={form.isPublic} onCheckedChange={form.setIsPublic} />
            </div>

            <div className="space-y-4 border-t pt-4">
              <AccessCodeSection
                enabled={form.codeEnabled}
                code={form.saved.accessCode}
                busy={form.busy}
                onEnabledChange={form.setCodeEnabled}
                onRegenerate={form.regenerate}
              />
              <CodeGrantedList
                users={form.saved.codeGranted}
                removedIds={form.removedCodeGranted}
                onToggleRemove={form.toggleRemoveCodeGranted}
              />
              <WhitelistUserPicker
                saved={form.saved.whitelist}
                change={form.whitelist}
                onChange={form.setWhitelist}
                search={api.search}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button onClick={form.save} disabled={form.busy || form.loading || !form.dirty}>
            {form.busy ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
