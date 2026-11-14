import { Alert, Avatar, Button, Empty, Select, Switch, Table, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import type { RoleUser, RoleUsersResponse } from "@/apis/adminRolesApi";
import { BadgePill } from "@/components/admin/BadgePill";
import {
  canEditRow,
  canToggleAdmin,
  type RoleChange,
} from "@/lib/admin-roles/role-change-rules";

interface RoleUserTableProps {
  data: RoleUsersResponse | null;
  loading: boolean;
  error: string | null;
  currentUserId: string | null;
  page: number;
  limit: number;
  /** Opens the confirm dialog; the controls never apply a change themselves. */
  onRequestChange: (row: RoleUser, change: RoleChange) => void;
  onHistory: (row: RoleUser) => void;
  onPage: (page: number) => void;
  onRetry: () => void;
  onClearFilters: () => void;
}

export function RoleUserTable(props: RoleUserTableProps) {
  const { t } = useTranslation("admin");
  const { data, currentUserId } = props;
  const adminCount = data?.systemAdminCount ?? 0;

  const columns: ColumnsType<RoleUser> = [
    {
      title: t("roles.columns.user"),
      key: "user",
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <Avatar src={row.avatar ?? undefined}>{(row.name || row.username || "?").charAt(0).toUpperCase()}</Avatar>
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{row.name || row.username}</div>
            <div className="truncate text-xs text-ink/60">{row.email}</div>
          </div>
        </div>
      ),
    },
    {
      title: t("roles.columns.role"),
      key: "role",
      width: 170,
      render: (_, row) => {
        const guard = canEditRow(row, currentUserId, adminCount);
        return (
          <Tooltip title={guard.reasonKey ? t(guard.reasonKey) : ""}>
            <Select
              aria-label={`${t("roles.columns.role")} ${row.email}`}
              value={row.role}
              disabled={!guard.editable}
              style={{ width: 140 }}
              onChange={(to) => to !== row.role && props.onRequestChange(row, { kind: "role", to })}
              options={[
                { value: "STUDENT", label: t("roles.role.STUDENT") },
                { value: "TEACHER", label: t("roles.role.TEACHER") },
              ]}
            />
          </Tooltip>
        );
      },
    },
    {
      title: t("roles.columns.systemAdmin"),
      key: "systemAdmin",
      width: 150,
      render: (_, row) => {
        const guard = canToggleAdmin(row, currentUserId, adminCount);
        return (
          <Tooltip title={guard.reasonKey ? t(guard.reasonKey) : ""}>
            <span>
              <Switch
                aria-label={`${t("roles.columns.systemAdmin")} ${row.email}`}
                checked={row.isSystemAdmin}
                disabled={!guard.editable}
                onChange={(grant) => props.onRequestChange(row, { kind: "admin", grant })}
              />
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: t("roles.columns.status"),
      key: "status",
      width: 190,
      render: (_, row) => (
        <span className="inline-flex flex-wrap gap-1">
          {row.isBanned && <BadgePill variant="negative">{t("roles.status.banned")}</BadgePill>}
          {!row.isVerified && <BadgePill>{t("roles.status.unverified")}</BadgePill>}
        </span>
      ),
    },
    {
      title: t("roles.columns.createdAt"),
      dataIndex: "createdAt",
      key: "createdAt",
      width: 150,
      render: (value: string) => format(new Date(value), "dd/MM/yyyy HH:mm"),
    },
    {
      title: t("roles.columns.history"),
      key: "history",
      width: 90,
      render: (_, row) => (
        <Button type="link" size="small" onClick={() => props.onHistory(row)}>
          {t("roles.columns.historyLink")}
        </Button>
      ),
    },
  ];

  if (props.error) {
    return (
      <Alert
        type="error"
        showIcon
        message={t("roles.users.loadError")}
        description={props.error}
        action={<Button size="small" onClick={props.onRetry}>{t("common.retry")}</Button>}
      />
    );
  }

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={data?.data ?? []}
      loading={props.loading}
      scroll={{ x: 900 }}
      locale={{
        emptyText: (
          <Empty description={t("roles.users.empty")}>
            <Button onClick={props.onClearFilters}>{t("roles.filters.clear")}</Button>
          </Empty>
        ),
      }}
      pagination={{
        current: props.page,
        pageSize: props.limit,
        total: data?.meta.total ?? 0,
        showSizeChanger: false,
        onChange: props.onPage,
      }}
    />
  );
}

