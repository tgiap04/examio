import { useState, useMemo, useEffect } from "react";
import { Table, Space, Skeleton, Alert, Button } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { useAdminStore } from "@/stores/useAdminStore";
import { AuditRow, ListAuditQuery } from "@/apis/adminApi";
import { BadgePill, type BadgeVariant } from "@/components/admin/BadgePill";

interface AuditTableProps {
  defaultAction?: string | string[];
  defaultAdminId?: string;
  defaultDateRange?: [string, string];
  defaultPageSize?: number;
  embedded?: boolean;
}

/** Longest common prefix — used for `contains` filtering when
 *  multiple actions are grouped (e.g. all admin.finance.* actions). */
function commonPrefix(strings: string[]): string {
  if (!strings.length) return "";
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return "";
    }
  }
  return prefix;
}

function toAuditAction(
  action: string | string[] | undefined,
): string | undefined {
  if (!action) return undefined;
  if (Array.isArray(action)) {
    // Backend uses Prisma `contains` (SQL ILIKE). Find the longest common
    // prefix so a group like ["admin.finance.refund","admin.finance.credit"]
    // becomes "admin.finance." and matches all finance audit rows.
    return commonPrefix(action) || undefined;
  }
  return action;
}

/** Human-readable action labels for each known admin action code. */
const actionLabels: Record<string, string> = {
  "admin.user.grant": "Cấp quyền admin",
  "admin.user.revoke": "Thu hồi quyền admin",
  "admin.user.ban": "Khóa người dùng",
  "admin.user.unban": "Mở khóa người dùng",
  "admin.user.update": "Cập nhật thông tin",
  "admin.finance.refund": "Hoàn tiền",
  "admin.finance.credit": "Cộng tiền",
  "admin.finance.tier": "Đổi gói",
  "admin.finance.tier_change": "Đổi gói",
};

function displayAction(action: string): string {
  return actionLabels[action] ?? action;
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
  defaultPageSize = 10,
  embedded = false,
}: AuditTableProps) {
  const { t } = useTranslation("admin");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const query = useMemo<ListAuditQuery>(
    () => ({
      action: toAuditAction(defaultAction),
      adminId: defaultAdminId,
      from: defaultDateRange?.[0],
      to: defaultDateRange?.[1],
      page,
      pageSize,
    }),
    [defaultAction, defaultAdminId, defaultDateRange, page, pageSize],
  );

  const auditVersion = useAdminStore((s) => s.auditVersion);

  useEffect(() => {
    useAdminStore.getState().fetchAudit(query);
  }, [query, auditVersion]);

  const auditData = useAdminStore((s) => s.audit.data);
  const auditLoading = useAdminStore((s) => s.audit.loading);
  const auditError = useAdminStore((s) => s.audit.error);

  const fmt = (val: string) => format(new Date(val), "dd/MM/yyyy HH:mm:ss", { locale: vi });

  const columns: ColumnsType<AuditRow> = [
    {
      title: t("audit.columns.createdAt"),
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (val: string) => fmt(val),
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
      render: (val: string) => <BadgePill variant={actionVariant(val)}>{displayAction(val)}</BadgePill>,
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

  if (auditError && !auditData) {
    return (
      <Alert
        type="error"
        message={t("audit.loadError")}
        description={auditError}
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

  const rows = auditData?.rows ?? [];
  const total = auditData?.total ?? 0;

  return (
    <div className={embedded ? "" : "space-y-2"}>
      {auditLoading && rows.length === 0
        ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        )
        : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={rows}
            loading={auditLoading}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              hideOnSinglePage: true,
              onChange: (p) => setPage(p),
              onShowSizeChange: (_p, s) => setPageSize(s),
            }}
            expandable={{
              expandedRowRender: (row) => (
                <pre className="m-0 max-w-full overflow-auto rounded bg-canvas p-3 font-mono text-xs text-ink/80">
                  {JSON.stringify(row.metadata ?? {}, null, 2)}
                </pre>
              ),
              rowExpandable: (row) =>
                row.metadata != null && Object.keys(row.metadata).length > 0,
            }}
          />
        )}
    </div>
  );
}
