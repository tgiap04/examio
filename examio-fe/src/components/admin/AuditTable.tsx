import { useMemo } from "react";
import { Table, Space, Skeleton, Alert, Button } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { useAdminStore } from "@/stores/useAdminStore";
import { AuditRow, ListAuditQuery } from "@/apis/adminApi";
import { BadgePill, type BadgeVariant } from "@/components/admin/BadgePill";

interface AuditTableProps {
  defaultAction?: string | string[];
  defaultAdminId?: number;
  defaultDateRange?: [string, string];
  pageSize?: number;
  embedded?: boolean;
}

function toActionQuery(
  action: string | string[] | undefined,
): string | undefined {
  if (!action) return undefined;
  if (Array.isArray(action)) {
    const prefix = action
      .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    return prefix ? `(?:${prefix})` : undefined;
  }
  return action;
}

function actionVariant(action: string): BadgeVariant {
  if (action.startsWith("admin.finance.refund")) return "negative";
  if (action.startsWith("admin.finance.credit")) return "positive";
  if (action.startsWith("admin.user.ban")) return "negative";
  if (action.startsWith("admin.user.unban")) return "positive";
  if (action.startsWith("admin.user.grant")) return "positive";
  return "neutral";
}

export function AuditTable({
  defaultAction,
  defaultAdminId,
  defaultDateRange,
  pageSize = 50,
  embedded = false,
}: AuditTableProps) {
  const { t } = useTranslation("admin");

  const query = useMemo<ListAuditQuery>(
    () => ({
      action: Array.isArray(defaultAction) ? defaultAction.join(",") : defaultAction,
      actorId: defaultAdminId,
      from: defaultDateRange?.[0],
      to: defaultDateRange?.[1],
      page: 1,
      size: pageSize,
    }),
    [defaultAction, defaultAdminId, defaultDateRange, pageSize],
  );

  useAdminStore.getState().fetchAudit(query);

  const { data, loading, error } = useAdminStore((s) => ({
    data: s.audit.data,
    loading: s.audit.loading,
    error: s.audit.error,
  }));

  const columns: ColumnsType<AuditRow> = [
    {
      title: t("audit.columns.createdAt"),
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (val: string) => format(new Date(val), "yyyy-MM-dd HH:mm:ss"),
    },
    {
      title: t("audit.columns.admin"),
      key: "admin",
      width: 200,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <span>{row.actorName || `#${row.actorId}`}</span>
          {row.actorName && (
            <span className="text-xs text-ink/50">#{row.actorId}</span>
          )}
        </Space>
      ),
    },
    {
      title: t("audit.columns.action"),
      dataIndex: "action",
      key: "action",
      width: 200,
      render: (val: string) => <BadgePill variant={actionVariant(val)}>{val}</BadgePill>,
    },
    {
      title: t("audit.columns.target"),
      key: "target",
      width: 200,
      render: (_, row) => (
        <span className="font-mono text-xs">
          {row.targetType}#{row.targetId}
        </span>
      ),
    },
    {
      title: t("audit.columns.reason"),
      dataIndex: "reason",
      key: "reason",
      ellipsis: true,
      render: (val: string | null) => val ?? "—",
    },
  ];

  if (error && !data) {
    return (
      <Alert
        type="error"
        message={t("audit.loadError")}
        description={error}
        showIcon
        action={
          <Button
            size="small"
            onClick={() => useAdminStore.getState().fetchAudit(query, true)}
          >
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className={embedded ? "" : "space-y-2"}>
      {loading && rows.length === 0
        ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        )
        : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={rows}
            loading={loading}
            pagination={{
              pageSize,
              total,
              showSizeChanger: false,
              hideOnSinglePage: true,
            }}
            expandable={{
              expandedRowRender: (row) => (
                <pre className="m-0 max-w-full overflow-auto rounded bg-canvas p-3 font-mono text-xs text-ink/80">
                  {JSON.stringify(row.metadata ?? {}, null, 2)}
                </pre>
              ),
              rowExpandable: (row) =>
                row.metadata !== null && Object.keys(row.metadata).length > 0,
            }}
          />
        )}
    </div>
  );
}
