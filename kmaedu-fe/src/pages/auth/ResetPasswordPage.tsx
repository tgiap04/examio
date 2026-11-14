import { Suspense, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/useAuthStore";
import Logo from "@/components/atoms/Logo";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/antd/input-otp";

function ResetPasswordForm() {
  const { t } = useTranslation("auth");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { resetPassword, loading } = useAuthStore();

  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return;

    try {
      await resetPassword({ email, code, newPassword });
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (error) {
      console.error("Failed to reset password:", error);
    }
  };

  if (success) {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
          <svg className="h-8 w-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mb-2 text-[18px] font-medium text-ink">{t("reset.success")}</h2>
        <p className="text-[14px] text-muted-foreground">{t("reset.redirecting")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-ink">
          {t("reset.email.label")}
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          required
          className="h-11 w-full rounded-[8px] border border-hairline bg-canvas px-3 text-[14px] text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/15"
        />
      </div>

      <div>
        <label htmlFor="code" className="mb-1.5 block text-[13px] font-medium text-ink">
          {t("reset.code.label")}
        </label>
        <div className="flex justify-center">
          <InputOTP maxLength={6} value={code} onChange={(value) => setCode(value)}>
            <InputOTPGroup>
              <InputOTPSlot index={0} className="h-12 w-12 text-lg border-hairline" />
              <InputOTPSlot index={1} className="h-12 w-12 text-lg border-hairline" />
              <InputOTPSlot index={2} className="h-12 w-12 text-lg border-hairline" />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} className="h-12 w-12 text-lg border-hairline" />
              <InputOTPSlot index={4} className="h-12 w-12 text-lg border-hairline" />
              <InputOTPSlot index={5} className="h-12 w-12 text-lg border-hairline" />
            </InputOTPGroup>
          </InputOTP>
        </div>
      </div>

      <div>
        <label htmlFor="newPassword" className="mb-1.5 block text-[13px] font-medium text-ink">
          {t("reset.newPassword.label")}
        </label>
        <div className="relative">
          <input
            id="newPassword"
            type={showPassword ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t("reset.newPassword.placeholder")}
            required
            minLength={6}
            className="h-11 w-full rounded-[8px] border border-hairline bg-canvas px-3 pr-12 text-[14px] text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/15"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-ink"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="mb-1.5 block text-[13px] font-medium text-ink">
          {t("reset.confirmPassword.label")}
        </label>
        <input
          id="confirmPassword"
          type={showPassword ? "text" : "password"}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder={t("reset.confirmPassword.placeholder")}
          required
          minLength={6}
          className="h-11 w-full rounded-[8px] border border-hairline bg-canvas px-3 text-[14px] text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/15"
        />
        {confirmPassword && newPassword !== confirmPassword && (
          <p className="mt-1 text-[12px] text-error">{t("reset.passwordMismatch")}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || newPassword !== confirmPassword}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-[8px] bg-brand-soft px-4 text-[14px] font-medium text-brand-strong transition-colors hover:bg-brand-soft-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("reset.processing")}
          </>
        ) : (
          t("reset.submit")
        )}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const { t } = useTranslation("auth");
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas landing-dot-paper p-4">
      <div className="w-full max-w-md">
        <div className="rounded-[16px] border border-hairline bg-canvas p-8 shadow-[0_18px_48px_rgba(20,20,19,0.08)]">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex justify-center">
              <Logo sizeLogo={36} sizeText={22} />
            </div>
            <h1 className="font-display text-[28px] font-medium tracking-[-0.015em] text-ink">
              {t("reset.title")}
            </h1>
            <p className="mt-2 text-[14px] text-body">
              {t("reset.description")}
            </p>
          </div>

          <Suspense
            fallback={
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-coral" />
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>

          <div className="mt-6 text-center">
            <Link to="/login" className="inline-flex items-center gap-2 text-[13px] text-muted-foreground transition-colors hover:text-ink">
              <ArrowLeft className="h-4 w-4" />
              {t("reset.backToLogin")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
