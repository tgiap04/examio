import { useEffect } from "react";
import { Alert, Button, Empty, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import type { RoleChangeEntry } from "@/apis/adminRolesApi";
import { useAdminRolesStore } from "@/stores/useAdminRolesStore";

interface RoleChangeHistoryProps {
  userId: string | undefined;
  page: number;
  onPage: (page: number) => void;
  onClearUser: () => void;
}

const LIMIT = 20;

/** Ban/unban/re-apply rows reuse the log with the same role on both sides: the reason says which. */
function changeLabel(t: (k: string, o?: Record<string, string>) => string, c: RoleChangeEntry): string {
  if (c.fromAdmin !== c.toAdmin) return t(c.toAdmin ? "roles.history.grantAdmin" : "roles.history.revokeAdmin");
  if (c.fromRole !== c.toRole) {
    return t("roles.history.roleChange", { from: t(`roles.role.${c.fromRole}`), to: t(`roles.role.${c.toRole}`) });
  }
  // Same role and flag on both sides: a ban/unban/re-apply row, told apart by the reason prefix.
  const reason = c.reason ?? "";
  if (/^unban(?::|$)/.test(reason)) return t("roles.history.unban");
  if (/^ban(?::|$)/.test(reason)) return t("roles.history.ban");
  return t("roles.history.reapply");
}

export function RoleChangeHistory({ userId, page, onPage, onClearUser }: RoleChangeHistoryProps) {
  const { t } = useTranslation("admin");
  const { data, loading, error } = useAdminRolesStore((s) => s.changes);

  useEffect(() => {
    void useAdminRolesStore.getState().fetchChanges({ userId, page, limit: LIMIT });
  }, [userId, page]);

  const columns: ColumnsType<RoleChangeEntry> = [
    {
      title: t("roles.history.time"),
      dataIndex: "createdAt",
      key: "time",
      width: 160,
      render: (v: string) => format(new Date(v), "dd/MM/yyyy HH:mm"),
    },
    {
      title: t("roles.history.actor"),
      key: "actor",
      render: (_, c) => (c.source === "cli" ? t("roles.history.cliActor") : c.actorEmail),
    },
    { title: t("roles.history.user"), dataIndex: "targetEmail", key: "user" },
    { title: t("roles.history.change"), key: "change", render: (_, c) => changeLabel(t, c) },
    // Plain text: React escapes it.
    { title: t("roles.history.reason"), dataIndex: "reason", key: "reason", render: (v: string | null) => v ?? "—" },
    { title: t("roles.history.source"), dataIndex: "source", key: "source", render: (v: string) => t(`roles.history.sources.${v}`, { defaultValue: v }) },
  ];

  return (
    <div className="space-y-3">
      {userId && (
        <Tag closable onClose={onClearUser}>
          {t("roles.history.userFilter", { user: data?.data[0]?.targetEmail ?? userId })}
        </Tag>
      )}
      {error ? (
        <Alert
          type="error"
          showIcon
          message={t("roles.history.loadError")}
          action={
            <Button size="small" onClick={() => void useAdminRolesStore.getState().fetchChanges({ userId, page, limit: LIMIT }, true)}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.data ?? []}
          loading={loading}
          scroll={{ x: 900 }}
          locale={{ emptyText: <Empty description={t("roles.history.empty")} /> }}
          pagination={{ current: page, pageSize: LIMIT, total: data?.meta.total ?? 0, showSizeChanger: false, onChange: onPage }}
        />
      )}
    </div>
  );
}
