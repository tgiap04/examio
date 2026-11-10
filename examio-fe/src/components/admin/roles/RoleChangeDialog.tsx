import { useEffect, useState } from "react";
import { Input, Modal } from "antd";
import { useTranslation } from "react-i18next";
import type { RoleUser } from "@/apis/adminRolesApi";
import {
  consequenceKeys,
  isDestructive,
  type RoleChange,
} from "@/lib/admin-roles/role-change-rules";

const REASON_MAX = 500;

export interface PendingChange {
  user: RoleUser;
  change: RoleChange;
}

interface RoleChangeDialogProps {
  pending: PendingChange | null;
  submitting: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function RoleChangeDialog({ pending, submitting, onConfirm, onCancel }: RoleChangeDialogProps) {
  const { t } = useTranslation("admin");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (pending) setReason("");
  }, [pending]);

  if (!pending) return null;
  const { user, change } = pending;
  const name = user.name || user.username;
  const roleLabel = (role: string) => t(`roles.role.${role}`);
  const body =
    change.kind === "role"
      ? t("roles.dialog.bodyRole", { name, email: user.email, from: roleLabel(user.role), to: roleLabel(change.to) })
      : t(change.grant ? "roles.dialog.bodyGrant" : "roles.dialog.bodyRevoke", { name, email: user.email });
  const [consequence, delay] = consequenceKeys(change);

  return (
    <Modal
      open
      centered
      maskClosable={!submitting}
      closable={!submitting}
      title={t(change.kind === "role" ? "roles.dialog.titleRole" : "roles.dialog.titleAdmin")}
      okText={t("roles.dialog.confirm")}
      cancelText={t("roles.dialog.cancel")}
      okButtonProps={{ danger: isDestructive(change), loading: submitting, disabled: submitting }}
      cancelButtonProps={{ disabled: submitting }}
      onOk={() => onConfirm(reason)}
      onCancel={() => !submitting && onCancel()}
    >
      <div className="space-y-3 text-sm text-ink">
        <p>{body}</p>
        <p className="text-ink/70">{t(consequence)}</p>
        <p className="text-ink/70">{t(delay)}</p>
        <div>
          <label htmlFor="role-change-reason" className="mb-1 block text-xs text-ink/70">
            {t("roles.dialog.reasonLabel")}
          </label>
          <Input.TextArea
            id="role-change-reason"
            value={reason}
            rows={3}
            maxLength={REASON_MAX}
            showCount
            disabled={submitting}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
