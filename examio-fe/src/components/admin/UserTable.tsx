import { useState, useMemo } from "react";
import {
  Table,
  Input,
  Select,
  DatePicker,
  Button,
  Space,
  Popconfirm,
  Tag,
  Tooltip,
  Skeleton,
  Alert,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { useDebounce } from "@/hooks/useDebounce";
import { useAdminStore } from "@/stores/useAdminStore";
import {
  banUserApi,
  unbanUserApi,
  grantAdminApi,
  revokeAdminApi,
  UserRow,
} from "@/apis/adminApi";
import { toast } from "@/components/antd/toast";
import { useAuthStore } from "@/stores/useAuthStore";
import { UserDetailDrawer } from "@/components/admin/UserDetailDrawer";

const { RangePicker } = DatePicker;

interface UserTableProps {
  onAction?: () => void;
}

interface Filters {
  search: string;
  isAdmin: "all" | "yes" | "no";
  isBanned: "all" | "yes" | "no";
  dateRange: [string, string] | null;
}

export function UserTable({ onAction }: UserTableProps) {
  const { t } = useTranslation("admin");
  const [filters, setFilters] = useState<Filters>({
    search: "",
    isAdmin: "all",
    isBanned: "all",
    dateRange: null,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [drawerUserId, setDrawerUserId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const debouncedSearch = useDebounce(filters.search, 300);
  const currentUser = useAuthStore((s) => s.user);

  const query = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      isAdmin: filters.isAdmin === "all" ? undefined : filters.isAdmin === "yes",
      isBanned:
        filters.isBanned === "all" ? undefined : filters.isBanned === "yes",
      from: filters.dateRange?.[0],
      to: filters.dateRange?.[1],
      page,
      size: pageSize,
    }),
    [debouncedSearch, filters, page, pageSize],
  );

  const { data, loading, error, refetch } = useAdminStore((s) => ({
    data: s.users.data,
    loading: s.users.loading,
    error: s.users.error,
    refetch: s.fetchUsers,
  }));

  useAdminStore.getState().fetchUsers(query);

  const isSelf = (row: UserRow) => currentUser?.id === row.id;

  const handleAction = async (
    row: UserRow,
    action: "ban" | "unban" | "grant" | "revoke",
  ) => {
    if (actionLoading) return;
    setActionLoading(row.id);
    try {
      if (action === "ban") await banUserApi(row.id);
      else if (action === "unban") await unbanUserApi(row.id);
      else if (action === "grant") await grantAdminApi(row.id);
      else if (action === "revoke") await revokeAdminApi(row.id);

      useAdminStore.getState().invalidateUsers();
      useAdminStore.getState().invalidateOverview();
      toast.success(t(`users.actions.${action}Success`));
      onAction?.();
    } catch (err) {
      toast.error(
        t(`users.actions.${action}Error`, {
          message: (err as Error).message,
        }),
      );
    } finally {
      setActionLoading(null);
    }
  };

  const columns: ColumnsType<UserRow> = [
    {
      title: t("users.columns.email"),
      dataIndex: "email",
      key: "email",
      width: 220,
    },
    {
      title: t("users.columns.username"),
      dataIndex: "username",
      key: "username",
      width: 140,
    },
    {
      title: t("users.columns.isAdmin"),
      dataIndex: "isAdmin",
      key: "isAdmin",
      width: 100,
      render: (val: boolean) => (
        <Tag color={val ? "geekblue" : "default"}>
          {val ? t("common.yes") : t("common.no")}
        </Tag>
      ),
    },
    {
      title: t("users.columns.isVerified"),
      dataIndex: "isVerified",
      key: "isVerified",
      width: 110,
      render: (val: boolean) => (
        <Tag color={val ? "green" : "default"}>
          {val ? t("common.yes") : t("common.no")}
        </Tag>
      ),
    },
    {
      title: t("users.columns.isBanned"),
      dataIndex: "isBanned",
      key: "isBanned",
      width: 100,
      render: (val: boolean) => (
        <Tag color={val ? "red" : "default"}>
          {val ? t("common.yes") : t("common.no")}
        </Tag>
      ),
    },
    {
      title: t("users.columns.createdAt"),
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (val: string) => format(new Date(val), "yyyy-MM-dd HH:mm"),
    },
    {
      title: t("users.columns.actions"),
      key: "actions",
      width: 280,
      fixed: "right",
      render: (_, row) => {
        const self = isSelf(row);
        return (
          <Space size="small">
            {row.isAdmin ? (
              <Tooltip
                title={self ? t("users.actions.cannotRevokeSelf") : ""}
              >
                <Button
                  size="small"
                  danger
                  disabled={self}
                  loading={actionLoading === row.id}
                  onClick={() => handleAction(row, "revoke")}
                >
                  {t("users.actions.revokeAdmin")}
                </Button>
              </Tooltip>
            ) : (
              <Button
                size="small"
                loading={actionLoading === row.id}
                onClick={() => handleAction(row, "grant")}
              >
                {t("users.actions.grantAdmin")}
              </Button>
            )}
            {row.isBanned ? (
              <Button
                size="small"
                loading={actionLoading === row.id}
                onClick={() => handleAction(row, "unban")}
              >
                {t("users.actions.unban")}
              </Button>
            ) : (
              <Popconfirm
                title={t("users.actions.banConfirm")}
                onConfirm={() => handleAction(row, "ban")}
                okText={t("common.yes")}
                cancelText={t("common.no")}
              >
                <Button
                  size="small"
                  danger
                  loading={actionLoading === row.id}
                >
                  {t("users.actions.ban")}
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  if (error) {
    return (
      <Alert
        type="error"
        message={t("users.loadError")}
        description={error}
        showIcon
        action={
          <Button size="small" onClick={() => useAdminStore.getState().fetchUsers(query, true)}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t("users.filters.searchPlaceholder")}
          value={filters.search}
          onChange={(e) => {
            setFilters((f) => ({ ...f, search: e.target.value }));
            setPage(1);
          }}
          style={{ width: 280 }}
        />
        <Select
          value={filters.isAdmin}
          style={{ width: 160 }}
          onChange={(val) => {
            setFilters((f) => ({ ...f, isAdmin: val }));
            setPage(1);
          }}
          options={[
            { label: t("users.filters.allRoles"), value: "all" },
            { label: t("users.filters.admin"), value: "yes" },
            { label: t("users.filters.user"), value: "no" },
          ]}
        />
        <Select
          value={filters.isBanned}
          style={{ width: 160 }}
          onChange={(val) => {
            setFilters((f) => ({ ...f, isBanned: val }));
            setPage(1);
          }}
          options={[
            { label: t("users.filters.allStatus"), value: "all" },
            { label: t("users.filters.banned"), value: "yes" },
            { label: t("users.filters.active"), value: "no" },
          ]}
        />
        <RangePicker
          onChange={(dates) => {
            setFilters((f) => ({
              ...f,
              dateRange: dates?.[0] && dates?.[1]
                ? [
                    dates[0].toISOString(),
                    dates[1].toISOString(),
                  ]
                : null,
            }));
            setPage(1);
          }}
        />
      </div>

      {loading && rows.length === 0 ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          onRow={(row) => ({
            onClick: () => setDrawerUserId(row.id),
            style: { cursor: "pointer" },
          })}
          scroll={{ x: 1100 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            onChange: (p, s) => {
              setPage(p);
              setPageSize(s);
            },
          }}
        />
      )}

      {drawerUserId !== null && (
        <UserDetailDrawer
          userId={drawerUserId}
          onClose={() => {
            setDrawerUserId(null);
            refetch(query, true);
          }}
        />
      )}
    </div>
  );
}
