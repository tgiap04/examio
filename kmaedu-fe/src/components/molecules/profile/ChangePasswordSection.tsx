"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/antd/card";
import { Button } from "@/components/antd/button";
import { Input } from "@/components/antd/input";
import { Lock, Loader2, Eye, EyeOff, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/components/antd/toast";
import { sendCodeChangePasswordApi, changePasswordApi } from "@/apis/authApi";
import { AxiosError } from "axios";

const getErrorMessage = (error: unknown): string => {
  if (error instanceof AxiosError && error.response?.data?.message) {
    return error.response.data.message;
  }
  if (error instanceof Error) return error.message;
  return "Đã xảy ra lỗi. Thử lại.";
};

export function ChangePasswordSection() {
  const [step, setStep] = useState<"initial" | "verify" | "success">("initial");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [code, setCode] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { toast } = useToast();

  const passwordsMatch = newPassword === confirmPassword;
  const passwordMinLength = newPassword.length >= 6;

  const handleSendCode = async () => {
    try {
      setIsSendingCode(true);
      await sendCodeChangePasswordApi();
      setStep("verify");
      toast.success("Mã xác minh đã được gửi đến email!");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Mật khẩu mới không khớp!");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Mật khẩu mới phải có ít nhất 6 ký tự!");
      return;
    }
    try {
      setIsSubmitting(true);
      await changePasswordApi({ code, currentPassword, newPassword });
      setStep("success");
      toast.success("Đổi mật khẩu thành công!");
      setTimeout(() => {
        setStep("initial");
        setCode("");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }, 3000);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setStep("initial");
    setCode("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-3 text-xl">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-hairline bg-surface-soft">
            <Lock className="h-5 w-5 text-coral" />
          </div>
          <div>
            <div className="font-display text-xl font-medium text-ink">Bảo mật</div>
            <p className="mt-0.5 text-sm font-normal text-muted-text">Quản lý mật khẩu tài khoản</p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        {step === "initial" && (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-body">Đổi mật khẩu để bảo vệ tài khoản của bạn.</p>
              <p className="mt-1 text-xs text-muted-text">Chúng tôi sẽ gửi mã xác minh đến email.</p>
            </div>
            <Button
              onClick={handleSendCode}
              disabled={isSendingCode}
              className="gap-2 bg-brand-soft text-brand-strong hover:bg-brand-soft-hover disabled:opacity-50 shrink-0"
            >
              {isSendingCode ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang gửi...
                </>
              ) : (
                "Đổi mật khẩu"
              )}
            </Button>
          </div>
        )}

        {step === "verify" && (
          <form onSubmit={handleChangePassword} className="space-y-5">
            <div className="flex items-start gap-3 rounded-lg border border-coral/20 bg-coral/5 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
              <div className="text-sm text-body">
                Mã xác minh đã được gửi đến email. Mã có hiệu lực trong{" "}
                <span className="font-medium text-ink">10 phút</span>.
              </div>
            </div>

            <div className="space-y-4">
              {/* Verification code */}
              <div className="space-y-2">
                <label htmlFor="code" className="text-sm font-medium text-ink">Mã xác minh</label>
                <Input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Nhập mã 6 số"
                  maxLength={6}
                  required
                  className="w-full"
                />
              </div>

              {/* Current password */}
              <div className="space-y-2">
                <label htmlFor="currentPassword" className="text-sm font-medium text-ink">Mật khẩu hiện tại</label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Nhập mật khẩu hiện tại"
                    required
                    className="w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-text transition-colors hover:text-ink"
                    aria-label={showCurrent ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div className="space-y-2">
                <label htmlFor="newPassword" className="text-sm font-medium text-ink">Mật khẩu mới</label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Ít nhất 6 ký tự"
                    minLength={6}
                    required
                    className="w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-text transition-colors hover:text-ink"
                    aria-label={showNew ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium text-ink">Xác nhận mật khẩu mới</label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    minLength={6}
                    required
                    className="w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-text transition-colors hover:text-ink"
                    aria-label={showConfirm ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && !passwordsMatch && (
                  <p className="text-xs text-error">Mật khẩu xác nhận không khớp</p>
                )}
              </div>
            </div>

            {newPassword.length > 0 && !passwordMinLength && (
              <p className="text-xs text-warning">Mật khẩu phải có ít nhất 6 ký tự</p>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                type="submit"
                disabled={isSubmitting || !passwordsMatch || !passwordMinLength}
                className="gap-2 bg-brand-soft text-brand-strong hover:bg-brand-soft-hover disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Đổi mật khẩu
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                className="gap-2 border-hairline bg-canvas text-ink hover:bg-surface-card"
              >
                Hủy
              </Button>
            </div>

            <button
              type="button"
              onClick={handleSendCode}
              disabled={isSendingCode}
              className="text-sm text-coral underline-offset-2 transition-colors hover:text-coral-active hover:underline disabled:opacity-50"
            >
              {isSendingCode ? "Đang gửi lại..." : "Gửi lại mã xác minh"}
            </button>
          </form>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <Check className="h-7 w-7 text-success" />
            </div>
            <div>
              <h3 className="font-display text-xl font-medium text-ink">Đổi mật khẩu thành công!</h3>
              <p className="mt-1 text-sm text-muted-text">Tài khoản của bạn đã được bảo mật hơn.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
