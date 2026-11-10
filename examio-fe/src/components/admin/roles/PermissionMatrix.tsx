import { useEffect } from "react";
import { Alert, Button, Skeleton } from "antd";
import { Check, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAdminRolesStore } from "@/stores/useAdminRolesStore";
import { groupPermissions, permissionI18nKey } from "@/lib/admin-roles/permission-groups";

const COLUMNS = ["STUDENT", "TEACHER", "SYSTEM_ADMIN"] as const;

export function PermissionMatrix() {
  const { t } = useTranslation("admin");
  const { data, loading, error } = useAdminRolesStore((s) => s.matrix);

  useEffect(() => {
    void useAdminRolesStore.getState().fetchMatrix();
  }, []);

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message={t("roles.matrix.loadError")}
        action={
          <Button size="small" onClick={() => void useAdminRolesStore.getState().fetchMatrix(true)}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (!data) return <Skeleton active paragraph={{ rows: 10 }} loading={loading || !error} />;

  const held = new Map(data.roles.map((r) => [r.key, new Set(r.permissions)]));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border border-hairline">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-surface-card text-left text-xs uppercase tracking-wide text-ink/60">
              <th className="px-4 py-2 font-medium">{t("roles.matrix.permission")}</th>
              {COLUMNS.map((c) => (
                <th key={c} className="w-36 px-4 py-2 text-center font-medium">{t(`roles.role.${c}`)}</th>
              ))}
            </tr>
          </thead>
          {groupPermissions(data.permissions).map((group) => (
            <tbody key={group.id}>
              <tr>
                <th colSpan={4} className="bg-canvas px-4 pb-1 pt-4 text-left text-xs font-semibold text-ink/80">
                  {t(`roles.matrix.groups.${group.id}`)}
                </th>
              </tr>
              {group.permissions.map((permission) => (
                <tr key={permission} className="border-t border-hairline">
                  <td className="px-4 py-2">
                    <div className="text-ink">{t(permissionI18nKey(permission))}</div>
                    <code className="font-mono text-xs text-ink/60">{permission}</code>
                  </td>
                  {COLUMNS.map((c) => {
                    const yes = held.get(c)?.has(permission) ?? false;
                    return (
                      <td key={c} className="px-4 py-2 text-center">
                        {yes ? (
                          <Check aria-label={t("roles.matrix.yes")} className="mx-auto h-4 w-4 text-coral" />
                        ) : (
                          <Minus aria-label={t("roles.matrix.no")} className="mx-auto h-4 w-4 text-ink/30" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="text-xs text-ink/60">{t("roles.matrix.footnote")}</p>
    </div>
  );
}
