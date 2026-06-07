import { useEffect, useState, useMemo } from "react";
import { Select, DatePicker, Space, Button } from "antd";
import { useTranslation } from "react-i18next";
import { AuditTable } from "@/components/admin/AuditTable";
import { listUsersApi, UserRow } from "@/apis/adminApi";

const { RangePicker } = DatePicker;

const ACTION_OPTIONS = [
  "admin.finance.refund",
  "admin.finance.credit",
  "admin.finance.tier_change",
  "admin.user.ban",
  "admin.user.unban",
  "admin.user.grant",
  "admin.user.revoke",
  "admin.user.update",
];

export default function AdminAuditPage() {
  const { t } = useTranslation("admin");
  const [adminOptions, setAdminOptions] = useState<UserRow[]>([]);
  const [adminId, setAdminId] = useState<number | undefined>(undefined);
  const [action, setAction] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [filterToken, setFilterToken] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await listUsersApi({ isAdmin: true, size: 100 });
        if (mounted) {
          const list: UserRow[] = res?.data ?? res ?? [];
          setAdminOptions(list);
        }
      } catch {
        // ignore — admin list non-critical
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const actionValue = useMemo(() => (action ? [action] : undefined), [action]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("pages.audit.title")}</h1>
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
          options={ACTION_OPTIONS.map((a) => ({ label: a, value: a }))}
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
          pageSize={50}
        />
      </div>
    </div>
  );
}
