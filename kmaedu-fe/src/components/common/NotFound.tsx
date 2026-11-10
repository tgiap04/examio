import { useTranslation } from "react-i18next";

/**
 * 404 dùng chung. FeatureRoute render component này khi trang bị admin tắt —
 * không gọi API, không lộ dữ liệu trang.
 */
export function NotFound() {
  const { t } = useTranslation("common");
  return (
    <div className="flex min-h-screen items-center justify-center p-4 text-center">
      <div>
        <h1 className="text-3xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">{t("notFound")}</p>
      </div>
    </div>
  );
}

export default NotFound;
