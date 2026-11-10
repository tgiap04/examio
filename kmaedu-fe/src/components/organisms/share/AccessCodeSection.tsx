"use client";

import { useState } from "react";
import { Copy, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/antd/button";
import { Input } from "@/components/antd/input";
import { Label } from "@/components/antd/label";
import { Switch } from "@/components/antd/switch";
import { toast } from "@/components/antd/toast";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";

interface AccessCodeSectionProps {
  enabled: boolean;
  /** The saved code; `null` until the teacher saves with the code on. */
  code: string | null;
  busy: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /** Rotates the code on the server (everyone who used the old one is asked again). */
  onRegenerate: () => Promise<void>;
}

export function AccessCodeSection({ enabled, code, busy, onEnabledChange, onRegenerate }: AccessCodeSectionProps) {
  const [confirming, setConfirming] = useState(false);

  const copy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    toast.success("Đã sao chép mã truy cập");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Lock className="h-4 w-4" />
          Mở bằng mã 6 số
        </Label>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>
      {enabled && (
        <>
          <div className="flex gap-2">
            <Input
              value={code ?? ""}
              readOnly
              placeholder="Mã sẽ được tạo khi bạn lưu"
              className="font-mono text-lg tracking-widest"
            />
            <Button variant="outline" size="icon" onClick={copy} disabled={!code} title="Sao chép mã">
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setConfirming(true)}
              disabled={!code || busy}
              title="Tạo mã mới"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Người nhập đúng mã được nhớ lại cho đến khi bạn đổi hoặc tắt mã.
          </p>
        </>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Tạo mã mới?"
        description="Người đã mở bằng mã cũ sẽ mất quyền truy cập. Người trong danh sách được phép không bị ảnh hưởng."
        confirmText="Tạo mã mới"
        isLoading={busy}
        onConfirm={async () => {
          await onRegenerate();
          setConfirming(false);
        }}
      />
    </div>
  );
}
