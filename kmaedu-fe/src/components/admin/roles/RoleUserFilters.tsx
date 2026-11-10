import { Button, Input, Select } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

export interface RoleFilterValues {
  q: string;
  role: "all" | "STUDENT" | "TEACHER";
  admin: "all" | "yes" | "no";
}

interface RoleUserFiltersProps {
  values: RoleFilterValues;
  onChange: (patch: Partial<RoleFilterValues>) => void;
  onClear: () => void;
}

export function RoleUserFilters({ values, onChange, onClear }: RoleUserFiltersProps) {
  const { t } = useTranslation("admin");
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder={t("roles.filters.search")}
        aria-label={t("roles.filters.search")}
        value={values.q}
        maxLength={100}
        onChange={(e) => onChange({ q: e.target.value })}
        style={{ width: 300 }}
      />
      <Select
        value={values.role}
        aria-label={t("roles.filters.role")}
        style={{ width: 170 }}
        onChange={(role) => onChange({ role })}
        options={[
          { value: "all", label: `${t("roles.filters.role")}: ${t("roles.filters.all")}` },
          { value: "STUDENT", label: t("roles.role.STUDENT") },
          { value: "TEACHER", label: t("roles.role.TEACHER") },
        ]}
      />
      <Select
        value={values.admin}
        aria-label={t("roles.filters.admin")}
        style={{ width: 190 }}
        onChange={(admin) => onChange({ admin })}
        options={[
          { value: "all", label: `${t("roles.filters.admin")}: ${t("roles.filters.all")}` },
          { value: "yes", label: t("roles.filters.adminYes") },
          { value: "no", label: t("roles.filters.adminNo") },
        ]}
      />
      <Button onClick={onClear}>{t("roles.filters.clear")}</Button>
    </div>
  );
}
