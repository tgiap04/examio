import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { SigninForm } from "@/components/organisms/auth/signin-form";

export default function LoginPage() {
  const { t } = useTranslation("auth");
  return (
    <div>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            {t("login.loading")}
          </div>
        }
      >
        <SigninForm />
      </Suspense>
    </div>
  );
}
