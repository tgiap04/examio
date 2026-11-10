import { useTranslation } from "react-i18next";
import { BadgePill } from "@/components/admin/BadgePill";

interface RoleBadgeProps {
  role: "STUDENT" | "TEACHER";
  isSystemAdmin: boolean;
}

/** Base role plus the system-admin flag (the two are independent). */
export function RoleBadge({ role, isSystemAdmin }: RoleBadgeProps) {
  const { t } = useTranslation("admin");
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <BadgePill variant={role === "TEACHER" ? "positive" : "neutral"}>
        {t(`roles.role.${role}`)}
      </BadgePill>
      {isSystemAdmin && <BadgePill variant="positive">{t("roles.role.SYSTEM_ADMIN")}</BadgePill>}
    </span>
  );
}
