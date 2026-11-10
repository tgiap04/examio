import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/antd/button";
import { useAuthStore } from "@/stores/useAuthStore";

/** Full-page notice shown when /auth/me could not be reached (not the same as signed out). */
export function SessionUnavailable() {
  const { t } = useTranslation("common");
  const getUser = useAuthStore((s) => s.getUser);
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      await getUser();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="text-muted-foreground">{t("session.unavailable.title")}</p>
      <Button onClick={retry} disabled={retrying}>
        {t("session.unavailable.retry")}
      </Button>
    </div>
  );
}
