import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();
  const { sendCodeResetPassword, loading } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) return;

    try {
      await sendCodeResetPassword({ email });
      setSent(true);
      setTimeout(() => {
        navigate(`/reset-password?email=${encodeURIComponent(email)}`);
      }, 2000);
    } catch (error) {
      console.error("Failed to send reset code:", error);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas landing-dot-paper p-4">
      <div className="w-full max-w-md">
        <div className="rounded-[16px] border border-hairline bg-canvas p-8 shadow-[0_18px_48px_rgba(20,20,19,0.08)]">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-coral/25 bg-coral/10">
              <Mail className="h-8 w-8 text-coral" />
            </div>
            <h1 className="font-display text-[28px] font-medium tracking-[-0.015em] text-ink">
              Quên mật khẩu?
            </h1>
            <p className="mt-2 text-[14px] text-body">
              Nhập email của bạn để nhận mã đặt lại mật khẩu
            </p>
          </div>

          {sent ? (
            <div className="py-4 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
                <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-medium text-success">Mã đặt lại đã được gửi!</p>
              <p className="mt-2 text-[13px] text-muted-foreground">Đang chuyển hướng...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-ink">
                  Email
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

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-coral px-4 text-[14px] font-medium text-white transition-colors hover:bg-coral-active disabled:bg-coral/50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang gửi...
                  </>
                ) : (
                  "Gửi mã đặt lại"
                )}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link to="/login" className="inline-flex items-center gap-2 text-[13px] text-muted-foreground transition-colors hover:text-ink">
              <ArrowLeft className="h-4 w-4" />
              Quay lại đăng nhập
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
