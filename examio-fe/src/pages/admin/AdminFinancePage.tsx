import { useState } from "react";
import { Button, Space } from "antd";
import { useTranslation } from "react-i18next";
import { FinanceActionModal, FinanceActionType } from "@/components/admin/FinanceActionModal";
import { AuditTable } from "@/components/admin/AuditTable";

export default function AdminFinancePage() {
  const { t } = useTranslation("admin");
  const [activeAction, setActiveAction] = useState<FinanceActionType | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-normal tracking-tight text-ink">{t("pages.finance.title")}</h1>
        <p className="text-sm text-ink/60">{t("pages.finance.subtitle")}</p>
      </div>

      <Space wrap>
        <Button type="primary" danger onClick={() => setActiveAction("refund")}>
          {t("finance.buttons.refund")}
        </Button>
        <Button onClick={() => setActiveAction("credit")}>
          {t("finance.buttons.credit")}
        </Button>
        <Button onClick={() => setActiveAction("tier")}>
          {t("finance.buttons.tier")}
        </Button>
      </Space>

      <section>
        <h2 className="mb-3 font-display text-base font-normal tracking-tight text-ink/70">
          {t("finance.recentTitle")}
        </h2>
        <AuditTable
          embedded
          defaultAction={[
            "admin.finance.refund",
            "admin.finance.credit",
            "admin.finance.tier_change",
          ]}
          pageSize={50}
        />
      </section>

      {activeAction && (
        <FinanceActionModal
          type={activeAction}
          open
          onClose={() => setActiveAction(null)}
        />
      )}
    </div>
  );
}
