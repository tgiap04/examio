import { useState } from "react";
import { Button, Popconfirm, Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import { banUserApi, unbanUserApi, type UserRow } from "@/apis/adminApi";
import { toast } from "@/components/antd/toast";
import { ApiFailure } from "@/lib/quiz-practice/api-failure";
import { banErrorKey, canBanRow } from "@/lib/admin-roles/role-change-rules";

interface UserBanActionsProps {
  row: UserRow;
  currentUserId: string | null;
  /** Cached count of system admins (`useAdminStore.fetchAdminList`). */
  adminCount: number;
  /** Called after any attempt that changed (or may have changed) server state. */
  onChanged: () => void;
}

/** Ban / unban through auth `SetUserStatus`; the guards are UX, the server answers 403/409. */
export function UserBanActions({ row, currentUserId, adminCount, onChanged }: UserBanActionsProps) {
  const { t } = useTranslation("admin");
  const [loading, setLoading] = useState(false);

  const run = async (action: "ban" | "unban") => {
    if (loading) return;
    setLoading(true);
    try {
      await (action === "ban" ? banUserApi(row.id) : unbanUserApi(row.id));
      toast.success(t(`users.actions.${action}Success`));
      onChanged();
    } catch (error) {
      const failure = error instanceof ApiFailure ? error : null;
      const { key, refetch } = banErrorKey(failure?.status, failure?.code);
      toast.error(key === "users.actions.banError" ? t(key, { message: (error as Error).message }) : t(key));
      // A stale admin count (409) means the list is out of date: refetch it.
      if (refetch) onChanged();
    } finally {
      setLoading(false);
    }
  };

  if (row.isBanned) {
    return (
      <Button size="small" loading={loading} onClick={() => run("unban")}>
        {t("users.actions.unban")}
      </Button>
    );
  }

  const guard = canBanRow(row, currentUserId, adminCount);
  return (
    <Tooltip title={guard.reasonKey ? t(guard.reasonKey) : ""}>
      <span>
        <Popconfirm
          title={t("users.actions.banConfirm")}
          description={t("users.ban.confirmNote")}
          onConfirm={() => run("ban")}
          okText={t("common.yes")}
          cancelText={t("common.no")}
          disabled={!guard.allowed}
        >
          <Button size="small" danger loading={loading} disabled={!guard.allowed}>
            {t("users.actions.ban")}
          </Button>
        </Popconfirm>
      </span>
    </Tooltip>
  );
}
