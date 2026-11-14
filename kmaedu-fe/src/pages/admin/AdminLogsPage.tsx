import { useTranslation } from "react-i18next";
import { LogStreamPanel } from "@/components/admin/LogStreamPanel";

export default function AdminLogsPage() {
  const { t } = useTranslation("admin");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-normal tracking-tight text-ink">{t("pages.logs.title")}</h1>
        <p className="text-sm text-ink/60">{t("pages.logs.subtitle")}</p>
      </div>
      <LogStreamPanel />
    </div>
  );
}
