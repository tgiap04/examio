"use client";

import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { IconBrandGoogle } from "@tabler/icons-react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/useAuthStore";
import { TurnstileGuard } from "@/components/molecules/TurnstileGuard";
import Logo from "@/components/atoms/Logo";

export function SigninForm() {
  const { t } = useTranslation("auth");
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const { loginWithGoogle, login } =
    useAuthStore();
  const [searchParams] = useSearchParams();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const credential = formData.get("credential") as string;
    const password = formData.get("password") as string;
    const from = searchParams.get("from");

    try {
      const response = await login({ credential, password, turnstileToken });
      if (response && response.user) {
        const targetPath = response.redirectTo || from || "/k";
        window.location.href = targetPath;
      } else {
        window.location.href = from || "/k";
      }
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas landing-dot-paper p-4">
      <div className="w-full max-w-md">
        <div className="rounded-[16px] border border-hairline bg-canvas p-8 shadow-[0_18px_48px_rgba(20,20,19,0.08)]">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex justify-center">
              <Logo sizeLogo={36} sizeText={22} />
            </div>
            <h1 className="font-display text-[28px] font-medium tracking-[-0.015em] text-ink">
              {t("login.welcome")}
            </h1>
            <p className="mt-2 text-[14px] text-body">
              {t("login.subtitle")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">
                {t("login.credential.label")}
              </label>
              <input
                name="credential"
                className="h-11 w-full rounded-[8px] border border-hairline bg-canvas px-3 text-[14px] text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/15"
                placeholder={t("login.credential.placeholder")}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[13px] font-medium text-ink">
                  {t("login.password.label")}
                </label>
                <Link
                  to="/forgot-password"
                  className="text-[13px] text-coral hover:text-coral-active"
                >
                  {t("login.forgotPassword")}
                </Link>
              </div>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  className="h-11 w-full rounded-[8px] border border-hairline bg-canvas px-3 pr-12 text-[14px] text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/15"
                  placeholder={t("login.password.placeholder")}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-ink"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!turnstileToken}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-coral px-4 text-[14px] font-medium text-white transition-colors hover:bg-coral-active disabled:bg-coral/50 disabled:cursor-not-allowed"
            >
              {t("login.submit")}
            </button>
          </form>

          <div className="my-6 flex items-center">
            <div className="flex-1 h-px bg-hairline" />
            <span className="px-4 text-[13px] text-muted-foreground">
              {t("login.orContinue")}
            </span>
            <div className="flex-1 h-px bg-hairline" />
          </div>

          <button
            disabled={!turnstileToken}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-hairline bg-canvas text-[14px] font-medium text-body transition-colors hover:bg-surface-soft disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
            onClick={() => loginWithGoogle?.()}
          >
            <IconBrandGoogle className="h-4 w-4" />
            <span>Google</span>
          </button>

          <div className="mt-6 flex justify-center gap-1 text-[13px] text-muted-foreground">
            <p>{t("login.noAccount")}</p>
            <Link to="/register" className="font-medium text-coral hover:text-coral-active">
              {t("login.signupLink")}
            </Link>
          </div>

          <div className="mt-4 flex justify-center">
            <TurnstileGuard onTokenReady={setTurnstileToken} onExpire={() => setTurnstileToken("")} />
          </div>
        </div>
      </div>
    </div>
  );
}
