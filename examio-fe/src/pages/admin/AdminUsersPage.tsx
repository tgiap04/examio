import { useTranslation } from "react-i18next";
import { UserTable } from "@/components/admin/UserTable";

export default function AdminUsersPage() {
  const { t } = useTranslation("admin");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("pages.users.title")}</h1>
        <p className="text-sm text-ink/60">{t("pages.users.subtitle")}</p>
      </div>
      <UserTable />
    </div>
  );
}
