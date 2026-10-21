import { useState, useMemo, useEffect } from "react";
import {
  Table,
  Input,
  Select,
  DatePicker,
  Button,
  Space,
  Skeleton,
  Alert,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { useDebounce } from "@/hooks/useDebounce";
import { useAdminStore } from "@/stores/useAdminStore";
import { UserRow } from "@/apis/adminApi";
import { useAuthStore } from "@/stores/useAuthStore";
import { UserDetailDrawer } from "@/components/admin/UserDetailDrawer";
import { BadgePill } from "@/components/admin/BadgePill";
import { RoleBadge } from "@/components/admin/roles/RoleBadge";
import { UserBanActions } from "@/components/admin/roles/UserBanActions";

const { RangePicker } = DatePicker;

interface UserTableProps {
  onAction?: () => void;
}

interface Filters {
  search: string;
  isSystemAdmin: "all" | "yes" | "no";
  isBanned: "all" | "yes" | "no";
  dateRange: [string, string] | null;
}

export function UserTable({ onAction }: UserTableProps) {
  const { t } = useTranslation("admin");
  const [filters, setFilters] = useState<Filters>({
    search: "",
    isSystemAdmin: "all",
    isBanned: "all",
    dateRange: null,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);
  const [adminCount, setAdminCount] = useState(0);

  const debouncedSearch = useDebounce(filters.search, 300);
  const currentUser = useAuthStore((s) => s.user);

  const query = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      isSystemAdmin:
        filters.isSystemAdmin === "all" ? undefined : filters.isSystemAdmin === "yes",
      isBanned:
        filters.isBanned === "all" ? undefined : filters.isBanned === "yes",
      from: filters.dateRange?.[0],
      to: filters.dateRange?.[1],
      page,
      pageSize,
    }),
    [debouncedSearch, filters, page, pageSize],
  );

  const usersData = useAdminStore((s) => s.users.data);
  const usersLoading = useAdminStore((s) => s.users.loading);
  const usersError = useAdminStore((s) => s.users.error);
  const usersVersion = useAdminStore((s) => s.usersVersion);

  useEffect(() => {
    useAdminStore.getState().fetchUsers(query);
  }, [query, usersVersion]);

  const currentUserId = currentUser?.id != null ? String(currentUser.id) : null;

  // Cached admin list (10 min, shared with the audit page): its length gates "Khóa" on the last admin.
  useEffect(() => {
    let cancelled = false;
    useAdminStore.getState().fetchAdminList().then((list) => {
      if (!cancelled) setAdminCount(list.length);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [usersVersion]);

  const handleChanged = () => {
    const admin = useAdminStore.getState();
    admin.invalidateUsers();
    admin.invalidateOverview();
    admin.invalidateAudit();
    admin.invalidateAdminList();
    // Re-fetch immediately so the table reflects the change
    admin.fetchUsers(query, true);
    onAction?.();
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
      title: t("users.columns.role"),
      key: "role",
      width: 190,
      render: (_, row) => <RoleBadge role={row.role} isSystemAdmin={row.isSystemAdmin} />,
    },
    {
      title: t("users.columns.isVerified"),
      dataIndex: "isVerified",
      key: "isVerified",
      width: 110,
      render: (val: boolean) => (
        <BadgePill variant={val ? "positive" : "neutral"}>
          {val ? t("common.yes") : t("common.no")}
        </BadgePill>
      ),
    },
    {
      title: t("users.columns.isBanned"),
      dataIndex: "isBanned",
      key: "isBanned",
      width: 100,
      render: (val: boolean) => (
        <BadgePill variant={val ? "negative" : "neutral"}>
          {val ? t("common.yes") : t("common.no")}
        </BadgePill>
      ),
    },
    {
      title: t("users.columns.createdAt"),
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (val: string) => format(new Date(val), "dd/MM/yyyy HH:mm", { locale: vi }),
    },
    {
      title: t("users.columns.actions"),
      key: "actions",
      width: 240,
      fixed: "right",
      render: (_, row) => (
        <div onClick={(e) => e.stopPropagation()} role="presentation">
          <Space size="small">
            <Link to={`/admin/roles?q=${encodeURIComponent(row.email)}`}>
              <Button size="small">{t("users.actions.manageRoles")}</Button>
            </Link>
            <UserBanActions
              row={row}
              currentUserId={currentUserId}
              adminCount={adminCount}
              onChanged={handleChanged}
            />
          </Space>
        </div>
      ),
    },
  ];

  if (usersError) {
    return (
      <Alert
        type="error"
        message={t("users.loadError")}
        description={usersError}
        showIcon
        action={
          <Button size="small" onClick={() => useAdminStore.getState().fetchUsers(query, true)}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const rows = usersData?.rows ?? [];
  const total = usersData?.total ?? 0;

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
          value={filters.isSystemAdmin}
          style={{ width: 160 }}
          onChange={(val) => {
            setFilters((f) => ({ ...f, isSystemAdmin: val }));
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

      {usersLoading && rows.length === 0 ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={usersLoading}
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
            useAdminStore.getState().fetchUsers(query, true);
          }}
        />
      )}
    </div>
  );
}
