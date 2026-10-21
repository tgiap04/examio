import { useEffect, useState, useMemo } from "react";
import { Select, DatePicker, Space, Button } from "antd";
import { useTranslation } from "react-i18next";
import { AuditTable } from "@/components/admin/AuditTable";
import { UserRow } from "@/apis/adminApi";
import { useAdminStore } from "@/stores/useAdminStore";

const { RangePicker } = DatePicker;

const ACTION_LABELS: Record<string, string> = {
  "admin.finance.refund": "Hoàn tiền",
  "admin.finance.credit": "Cộng tiền",
  "admin.finance.tier": "Đổi gói",
  "admin.finance.tier_change": "Đổi gói",
  "admin.user.ban": "Khóa người dùng",
  "admin.user.unban": "Mở khóa người dùng",
  "admin.user.grant": "Cấp quyền admin",
  "admin.user.revoke": "Thu hồi quyền admin",
  "admin.user.update": "Cập nhật thông tin",
};

// grant/revoke are no longer emitted: admin-flag changes live in the role-change log (/admin/roles).
// Their labels stay so historical rows still read well, but they are not offered as filters.
const LEGACY_ACTIONS = new Set(["admin.user.grant", "admin.user.revoke"]);
const ACTION_OPTIONS = Object.keys(ACTION_LABELS).filter((a) => !LEGACY_ACTIONS.has(a));

export default function AdminAuditPage() {
  const { t } = useTranslation("admin");
  const [adminOptions, setAdminOptions] = useState<UserRow[]>([]);
  const [adminId, setAdminId] = useState<number | undefined>(undefined);
  const [action, setAction] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [filterToken, setFilterToken] = useState(0);

  // Load admin list from the store (cached for 10 min, shared across pages).
  useEffect(() => {
    let cancelled = false;
    useAdminStore.getState().fetchAdminList().then((list) => {
      if (!cancelled) setAdminOptions(list);
    });
    return () => { cancelled = true; };
  }, []);

  const actionValue = useMemo(() => (action ? [action] : undefined), [action]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-normal tracking-tight text-ink">{t("pages.audit.title")}</h1>
        <p className="text-sm text-ink/60">{t("pages.audit.subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Select
          allowClear
          placeholder={t("audit.filters.adminPlaceholder")}
          style={{ width: 220 }}
          value={adminId}
          onChange={(val) => setAdminId(val)}
          options={adminOptions.map((u) => ({
            label: `${u.name || u.username} (${u.email})`,
            value: u.id,
          }))}
          showSearch
          optionFilterProp="label"
        />
        <Select
          allowClear
          placeholder={t("audit.filters.actionPlaceholder")}
          style={{ width: 280 }}
          value={action}
          onChange={(val) => setAction(val)}
          options={ACTION_OPTIONS.map((a) => ({ label: ACTION_LABELS[a] ?? a, value: a }))}
          showSearch
        />
        <RangePicker
          onChange={(dates) => {
            if (dates?.[0] && dates?.[1]) {
              setDateRange([
                dates[0].toISOString(),
                dates[1].toISOString(),
              ]);
            } else {
              setDateRange(null);
            }
          }}
        />
        <Space>
          <Button type="primary" onClick={() => setFilterToken((tok) => tok + 1)}>
            {t("common.apply")}
          </Button>
          <Button
            onClick={() => {
              setAdminId(undefined);
              setAction(undefined);
              setDateRange(null);
              setFilterToken((tok) => tok + 1);
            }}
          >
            {t("common.reset")}
          </Button>
        </Space>
      </div>

      <div key={filterToken}>
        <AuditTable
          defaultAction={actionValue}
          defaultAdminId={adminId}
          defaultDateRange={dateRange ?? undefined}
          defaultPageSize={10}
        />
      </div>
    </div>
  );
}
