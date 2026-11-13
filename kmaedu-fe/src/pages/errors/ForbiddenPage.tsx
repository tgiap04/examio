import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/useAuthStore";
import { usePageConfigStore } from "@/stores/usePageConfigStore";
import { resolveLandingPath } from "@/lib/rbac/landing-path";

export default function ForbiddenPage() {
  const { t } = useTranslation("common");
  const user = useAuthStore((s) => s.user);
  const permissions = useAuthStore((s) => s.permissions);
  const pageMap = usePageConfigStore((s) => s.pages);

  const home = user
    ? resolveLandingPath({
        role: user.role,
        isSystemAdmin: user.isSystemAdmin,
        permissions,
        pageMap,
      })
    : "/";

  return (
    <div className="flex min-h-screen items-center justify-center p-4 text-center">
      <div className="max-w-md">
        <h1 className="text-3xl font-bold">403</h1>
        <h2 className="mt-2 text-xl font-semibold">{t("forbidden.title")}</h2>
        <p className="mt-2 text-muted-foreground">{t("forbidden.description")}</p>
        <Link
          to={home}
          className="mt-6 inline-flex rounded-md bg-brand-soft px-4 py-2 text-sm font-medium text-brand-strong"
        >
          {t("forbidden.backHome")}
        </Link>
      </div>
    </div>
  );
}
