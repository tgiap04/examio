import { type FormEvent, type PropsWithChildren, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Mail, PanelLeft, Search, X } from "lucide-react";
import { NAV_ITEMS } from "@/lib/rbac/nav-items";
import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_COLLAPSED } from "@/components/organisms/nav/sidebar-styles";
import ProfileDropdown from "@/components/atoms/ProfileDropdown";
import { SidebarKit } from "@/components/organisms/k/SideBar";
import { PendingJobDialog } from "@/components/organisms/PendingJobDialog";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { useJobStore } from "@/stores/useAIGeneratorStore";
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

  const sidebarWidth = isDesktop ? (sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH) : 0;

  // Page title in the header: the nav item that owns the current path (longest href match).
  const pageTitle =
    [...NAV_ITEMS]
      .filter((item) => location.pathname === item.href || location.pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.label ?? "Tổng quan";

  // ⌘K / Ctrl+K focuses the workspace search.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    // The sidebar's "Tìm nhanh" card asks for the same focus.
    const onFocusSearch = () => searchRef.current?.focus();
    window.addEventListener("keydown", onKey);
    window.addEventListener("kmaedu:focus-search", onFocusSearch);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("kmaedu:focus-search", onFocusSearch);
    };
  }, []);

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
        "mx-auto flex min-h-screen w-full flex-1 flex-col bg-page text-ink md:flex-row",
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
                className="flex min-h-9 items-center rounded-md bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand-strong transition-colors hover:bg-brand-soft-hover"
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
          className="fixed right-0 top-0 z-50 border-b border-hairline bg-canvas/80 backdrop-blur-xl"
          style={{ left: isDesktop ? sidebarWidth : 0, width: isDesktop ? `calc(100% - ${sidebarWidth}px)` : "100%" }}
        >
          <div className="flex h-16 w-full items-center gap-3 px-4 xl:px-6 2xl:px-8">
            <div className="flex min-w-0 items-center gap-2.5">
              {isMobile && <Logo sizeLogo={32} sizeText={0} />}
              {isDesktop && (
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed((current) => !current)}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-soft hover:text-ink"
                  aria-label={sidebarCollapsed ? "Mở rộng sidebar" : "Thu nhỏ sidebar"}
                >
                  <PanelLeft className={cn("h-[18px] w-[18px] transition-transform", sidebarCollapsed && "rotate-180")} />
                </button>
              )}
              {isDesktop && <span aria-hidden className="h-5 w-px bg-hairline" />}
              <h2 className="truncate text-sm font-semibold text-ink">{pageTitle}</h2>
            </div>

            <form
              onSubmit={handleSearch}
              className="ml-auto hidden h-9 w-full max-w-xs items-center gap-2 rounded-lg border border-hairline bg-surface-soft px-2.5 text-[13px] text-muted-foreground transition-colors focus-within:border-brand-border focus-within:bg-canvas focus-within:ring-2 focus-within:ring-coral/15 lg:flex xl:max-w-sm"
            >
              <Search className="h-4 w-4 shrink-0" />
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground"
                placeholder="Tìm tài liệu, đề thi, phòng thi..."
                aria-label="Tìm kiếm trong workspace"
              />
              <kbd className="hidden shrink-0 rounded border border-hairline bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground xl:inline">⌘K</kbd>
            </form>

            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <ProfileDropdown data={profile} variant="header" />
            </div>
          </div>
        </header>

        {children}

        <footer className="mx-4 mt-12 border-t border-hairline pb-6 pt-4 text-center text-xs text-muted-foreground xl:mx-6 2xl:mx-8">
          <p>
            © {new Date().getFullYear()} KMAEdu. All rights reserved. Made with love in Vietnam.
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
