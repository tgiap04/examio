import { type FormEvent, type PropsWithChildren, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Languages, Mail, Moon, PanelLeft, Search, Sun, X } from "lucide-react";
import ProfileDropdown from "@/components/atoms/ProfileDropdown";
import { SidebarKit } from "@/components/organisms/k/SideBar";
import { PendingJobDialog } from "@/components/organisms/PendingJobDialog";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { useJobStore } from "@/stores/useAIGeneratorStore";
import { useThemeContext } from "@/provider/ThemeProvider";
import { useIsDesktop, useIsMobile } from "@/hooks/useMediaQuery";
import { usePageConfigSse } from "@/hooks/usePageConfigSse";
import Logo from "@/components/atoms/Logo";

export function KLayout({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();

  // Kết nối SSE realtime cho page-toggle (1 connection suốt vòng đời layout).
  usePageConfigSse();
  const { user, sendVerificationEmail, loading } = useAuthStore();
  const isDesktop = useIsDesktop();
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar_collapsed") === "true";
  });

  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const sidebarWidth = isDesktop ? (sidebarCollapsed ? 72 : 272) : 0;

  const profile = {
    name: user?.name || user?.username || "Người dùng",
    email: user?.email || "",
    avatar: user?.avatar || "",
  };
  const {
    showPendingJobDialog,
    resumePendingJob,
    cancelPendingJob,
    closePendingJobDialog,
  } = useJobStore();
  const [showVerifyAlert, setShowVerifyAlert] = useState(true);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [isCancelingJob, setIsCancelingJob] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [language, setLanguage] = useState<"VI" | "EN">("VI");
  const { isDarkMode, setTheme } = useThemeContext();

  const handleResendVerification = async () => {
    setSendingEmail(true);
    try {
      await sendVerificationEmail();
    } catch (error) {
      console.error("Failed to send verification email:", error);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleContinueJob = () => {
    resumePendingJob();
    navigate("/k/ai-tool");
  };

  const handleCancelJob = async () => {
    setIsCancelingJob(true);
    try {
      await cancelPendingJob();
    } finally {
      setIsCancelingJob(false);
    }
  };

  const showVerificationBanner = user && user.isVerified === false && showVerifyAlert;

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();

    if (!query) {
      navigate("/k/my-materials");
      return;
    }

    const normalized = query.toLowerCase();
    if (normalized.includes("flash")) {
      navigate(`/k/flash-card?search=${encodeURIComponent(query)}`);
      return;
    }

    if (normalized.includes("phòng") || normalized.includes("room")) {
      navigate(`/k/manage-exam-room?search=${encodeURIComponent(query)}`);
      return;
    }

    if (normalized.includes("đề") || normalized.includes("thi") || normalized.includes("exam")) {
      navigate(`/k/manage-exam?search=${encodeURIComponent(query)}`);
      return;
    }

    navigate(`/k/my-materials?search=${encodeURIComponent(query)}`);
  };

  return (
    <div
      className={cn(
        "mx-auto flex min-h-screen w-full flex-1 flex-col bg-canvas text-ink md:flex-row",
      )}
    >
      <SidebarKit collapsed={sidebarCollapsed} />

      <main
        className="m-0 overflow-x-clip pb-5 pt-10 xl:pb-0"
        style={{
          marginLeft: isDesktop ? sidebarWidth : 0,
          // Width must exclude the sidebar gutter — using w-full (100%) together
          // with marginLeft pushed main's box past the viewport by sidebarWidth,
          // creating a phantom horizontal overflow on every desktop page.
          width: isDesktop ? `calc(100% - ${sidebarWidth}px)` : "100%",
        }}
      >
        {showVerificationBanner && (
          <div className="mx-4 mt-4 flex w-auto flex-col items-start justify-between gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-body shadow-[0_1px_3px_rgba(20,20,19,0.08)] sm:flex-row sm:items-center sm:gap-4 sm:px-4 sm:py-2.5">
            <div className="flex flex-1 items-center gap-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-warning" />
              <p className="text-xs font-medium sm:text-sm">
                Tài khoản chưa được xác minh. Vui lòng kiểm tra email để xác minh tài khoản.
              </p>
            </div>
            <div className="flex w-full flex-shrink-0 items-center gap-2 sm:w-auto">
              <button
                onClick={handleResendVerification}
                disabled={sendingEmail || loading}
                className="flex min-h-9 items-center gap-1.5 rounded-md border border-warning/30 bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-card disabled:opacity-50"
              >
                <Mail className="h-3.5 w-3.5" />
                {sendingEmail ? "Đang gửi..." : "Gửi lại email"}
              </button>
              <Link
                to="/k/verify"
                state={{ from: location.pathname }}
                className="flex min-h-9 items-center rounded-md bg-coral px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-coral-active"
              >
                Xác minh ngay
              </Link>
              <button
                type="button"
                aria-label="Ẩn thông báo xác minh"
                onClick={() => setShowVerifyAlert(false)}
                className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-card hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <header
          className="fixed right-0 top-0 z-50 border-b border-hairline bg-canvas/95 backdrop-blur-md"
          style={{ left: isDesktop ? sidebarWidth : 0, width: isDesktop ? `calc(100% - ${sidebarWidth}px)` : "100%" }}
        >
          <div className="flex min-h-16.5 w-full items-center justify-between gap-3 px-4 xl:px-6 2xl:px-8">
            <div className="flex min-w-0 items-center gap-3">
              {isMobile && <Logo sizeLogo={40} sizeText={0} />}
              {isDesktop && (
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed((current) => !current)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-hairline bg-surface-soft text-muted-foreground transition-colors hover:bg-surface-card hover:text-ink"
                  aria-label={sidebarCollapsed ? "Mở rộng sidebar" : "Thu nhỏ sidebar"}
                >
                  <PanelLeft className={cn("h-5 w-5 transition-transform", sidebarCollapsed && "rotate-180")} />
                </button>
              )}
            </div>

            <form
              onSubmit={handleSearch}
              className="hidden min-h-11 w-full max-w-sm items-center gap-2 rounded-lg border border-hairline bg-surface-soft px-3 text-sm text-muted-foreground transition-colors focus-within:border-coral focus-within:bg-canvas lg:flex"
            >
              <Search className="h-4 w-4" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground"
                placeholder="Tìm tài liệu, đề thi, phòng thi..."
                aria-label="Tìm kiếm trong workspace"
              />
            </form>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTheme(isDarkMode ? "light" : "dark")}
                className="grid h-10 w-10 place-items-center rounded-lg border border-hairline bg-surface-soft text-body transition-colors hover:bg-surface-card hover:text-ink"
                aria-label={isDarkMode ? "Bật giao diện sáng" : "Bật giao diện tối"}
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <ProfileDropdown data={profile} variant="header" />
            </div>
          </div>
        </header>

        {children}

        <footer className="mx-4 mt-12 border-t border-hairline pb-6 pt-4 text-center text-xs text-muted-foreground xl:mx-6 2xl:mx-8">
          <p>
            This site is protected by Cloudflare Turnstile. See{" "}
            <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" className="underline hover:text-body">Privacy Policy</a>
            {" "}and{" "}
            <a href="https://www.cloudflare.com/website-terms-of-use/" target="_blank" rel="noopener noreferrer" className="underline hover:text-body">Terms of Service</a>
            {" "}apply.
          </p>
          <p className="mt-2">
            © {new Date().getFullYear()} Examio. All rights reserved. Made with love in Vietnam.
          </p>
        </footer>
      </main>

      <PendingJobDialog
        open={showPendingJobDialog}
        onOpenChange={closePendingJobDialog}
        isLoading={isCancelingJob}
        onContinue={handleContinueJob}
        onCancel={handleCancelJob}
      />
    </div>
  );
}
