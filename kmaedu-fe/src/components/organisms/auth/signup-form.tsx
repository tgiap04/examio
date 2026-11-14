"use client";
import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { normalizeReturnPath } from "@/lib/authRedirect";
import { Input } from "@/components/antd/input";
import { IconBrandGoogle } from "@tabler/icons-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "@/components/antd/toast";
import { useTranslation } from "react-i18next";
import Logo from "@/components/atoms/Logo";

export function SignupForm() {
  const { t } = useTranslation("auth");
  const { signup, loginWithGoogle } =
    useAuthStore();
  const [searchParams] = useSearchParams();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const username = formData.get("username") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (password !== (formData.get("confirmPassword") as string)) {
      toast.warning(t("signup.passwordMismatch"));
      return;
    }

    try {
      const response = await signup({
        username,
        email,
        password,
      });
      const from = normalizeReturnPath(searchParams.get("from"));
      if (response && response.user) {
        window.location.href = from || response.redirectTo || "/k";
      } else {
        window.location.href = from || "/k";
      }
    } catch (error) {
      console.error("Signup failed:", error);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas landing-dot-paper p-4 py-8 w-full">
      <div className="w-full max-w-md">
        <div className="rounded-[16px] border border-hairline bg-canvas p-8 shadow-[0_18px_48px_rgba(20,20,19,0.08)]">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex justify-center">
              <Logo sizeLogo={36} sizeText={22} />
            </div>
            <h1 className="font-display text-[28px] font-medium tracking-[-0.015em] text-ink">
              {t("signup.welcome")}
            </h1>
            <p className="mt-2 text-[14px] text-body">
              {t("signup.title")}
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="username" className="mb-1.5 block text-[13px] font-medium text-ink">
                {t("signup.username.label")}
              </label>
              <Input
                id="username"
                name="username"
                placeholder={t("signup.username.placeholder")}
                type="text"
                className="h-10 w-full rounded-[8px] border border-hairline bg-canvas px-3 text-[14px] text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/15"
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-ink">
                {t("signup.email.label")}
              </label>
              <Input
                id="email"
                name="email"
                placeholder={t("signup.email.placeholder")}
                type="email"
                className="h-10 w-full rounded-[8px] border border-hairline bg-canvas px-3 text-[14px] text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/15"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-ink">
                {t("signup.password.label")}
              </label>
              <Input
                id="password"
                name="password"
                placeholder={t("signup.password.placeholder")}
                type="password"
                className="h-10 w-full rounded-[8px] border border-hairline bg-canvas px-3 text-[14px] text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/15"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-1.5 block text-[13px] font-medium text-ink">
                {t("signup.confirmPassword.label")}
              </label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                placeholder={t("signup.confirmPassword.placeholder")}
                type="password"
                className="h-10 w-full rounded-[8px] border border-hairline bg-canvas px-3 text-[14px] text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/15"
              />
            </div>

            <button
              className="flex h-9 w-full items-center justify-center gap-2 rounded-[8px] bg-brand-soft px-4 text-[14px] font-medium text-brand-strong transition-colors hover:bg-brand-soft-hover disabled:opacity-50 disabled:cursor-not-allowed"
              type="submit"
            >
              {t("signup.submit")}
            </button>

            <div className="my-6 flex items-center">
              <div className="flex-1 h-px bg-hairline" />
              <span className="px-4 text-[13px] text-muted-foreground">
                {t("signup.orRegister")}
              </span>
              <div className="flex-1 h-px bg-hairline" />
            </div>

            <button
              className="flex h-9 w-full items-center justify-center gap-2 rounded-[8px] border border-hairline bg-canvas text-[14px] font-medium text-body transition-colors hover:bg-surface-soft disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
              onClick={() => loginWithGoogle?.()}
            >
              <IconBrandGoogle className="h-4 w-4" />
              <span>Google</span>
            </button>

            <div className="mt-6 flex justify-center gap-1 text-[13px] text-muted-foreground">
              <p>{t("signup.hasAccount")}</p>
              <Link to="/login" className="font-medium text-coral hover:text-coral-active">
                {t("signup.loginLink")}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
