import { useEffect, useState } from "react";
import { Switch, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useTranslation } from "react-i18next";
import {
  fetchPageConfigList,
  togglePageConfig,
  type PageConfigItem,
} from "@/apis/adminPageConfigApi";
import { toast } from "@/components/antd/toast";

export default function AdminPageConfigPage() {
  const { t } = useTranslation("admin");
  const [rows, setRows] = useState<PageConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPageConfigList()
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("pageConfig.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleToggle = async (key: string, next: boolean) => {
    const prev = rows;
    // Optimistic update
    setRows((current) =>
      current.map((it) => (it.key === key ? { ...it, enabled: next } : it)),
    );
    setSavingKey(key);
    try {
      await togglePageConfig(key, next);
      toast.success(next ? t("pageConfig.enabled") : t("pageConfig.disabled"));
    } catch {
      setRows(prev); // rollback
      toast.error(t("pageConfig.saveError"));
    } finally {
      setSavingKey(null);
    }
  };

  const columns: ColumnsType<PageConfigItem> = [
    {
      title: t("pageConfig.columns.label"),
      dataIndex: "label",
      key: "label",
    },
    {
      title: t("pageConfig.columns.key"),
      dataIndex: "key",
      key: "key",
      render: (key: string) => (
        <code className="text-xs text-ink/60">{key}</code>
      ),
    },
    {
      title: t("pageConfig.columns.enabled"),
      dataIndex: "enabled",
      key: "enabled",
      width: 120,
      render: (enabled: boolean, row) => (
        <Switch
          checked={enabled}
          loading={savingKey === row.key}
          onChange={(value) => handleToggle(row.key, value)}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-normal tracking-tight text-ink">
          {t("pages.pageConfig.title")}
        </h1>
        <p className="text-sm text-ink/60">{t("pages.pageConfig.subtitle")}</p>
      </div>

      <Table
        rowKey="key"
        loading={loading}
        dataSource={rows}
        columns={columns}
        pagination={false}
      />
    </div>
  );
}
