import { type FormEvent, type PropsWithChildren, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, ChevronsLeft, Mail, Search, X } from "lucide-react";
import { Dropdown } from "antd";
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
        className="m-0 overflow-x-clip pb-5 pt-[52px] xl:pb-0"
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
          className="fixed right-0 top-0 z-50 overflow-hidden border-b border-hairline bg-canvas/90 backdrop-blur-xl"
          style={{ left: isDesktop ? sidebarWidth : 0, width: isDesktop ? `calc(100% - ${sidebarWidth}px)` : "100%" }}
        >
          {/* soft pink waves on the right, as in the brand mock */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-[45%] overflow-hidden">
            <div className="absolute -right-24 -top-40 h-96 w-[520px] rotate-[-18deg] rounded-[50%] bg-gradient-to-l from-[#fde4e2] via-[#fef1f0] to-transparent opacity-80" />
            <div className="absolute -right-10 -top-24 h-72 w-[380px] rotate-[-24deg] rounded-[50%] border-l-[28px] border-[#fdecea]/90" />
          </div>

          <div className="relative flex h-[76px] w-full items-center gap-4 px-4 xl:px-6 2xl:px-8">
            {isMobile && <Logo sizeLogo={32} sizeText={0} />}
            {isDesktop && (
              <button
                type="button"
                onClick={() => setSidebarCollapsed((current) => !current)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-hairline bg-canvas text-body shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-colors hover:border-brand-border hover:text-brand-strong"
                aria-label={sidebarCollapsed ? "Mở rộng sidebar" : "Thu nhỏ sidebar"}
              >
                <ChevronsLeft className={cn("h-5 w-5 transition-transform duration-200", sidebarCollapsed && "rotate-180")} />
              </button>
            )}

            <form
              onSubmit={handleSearch}
              className="hidden h-12 w-full max-w-md items-center gap-3 rounded-full border border-hairline bg-canvas px-4 text-[15px] text-muted-foreground shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-colors focus-within:border-brand-border focus-within:ring-4 focus-within:ring-coral/10 lg:flex xl:max-w-lg"
            >
              <Search className="h-5 w-5 shrink-0 text-body" />
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground"
                placeholder="Tìm kiếm tài liệu, đề thi, flashcard..."
                aria-label="Tìm kiếm trong workspace"
              />
              <kbd className="hidden shrink-0 rounded-lg bg-surface-card px-2 py-1 font-sans text-[12px] font-semibold text-body xl:inline">⌘K</kbd>
            </form>

            <div className="ml-auto flex items-center gap-3">
              <Dropdown
                trigger={["click"]}
                placement="bottomRight"
                popupRender={() => (
                  <div role="dialog" aria-label="Thông báo" className="w-80 rounded-2xl border border-hairline bg-canvas p-4 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
                    <p className="text-[15px] font-semibold text-ink">Thông báo</p>
                    <div className="mt-3 flex flex-col items-center gap-2 rounded-xl bg-surface-soft px-4 py-6 text-center">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-brand-strong">
                        <Bell className="h-5 w-5" />
                      </span>
                      <p className="text-[13px] font-medium text-ink">Chưa có thông báo</p>
                      <p className="text-xs text-muted-foreground">Thông báo về bài thi, phòng học và tài liệu sẽ hiện ở đây.</p>
                    </div>
                  </div>
                )}
              >
                <button
                  type="button"
                  aria-label="Thông báo"
                  className="grid h-11 w-11 place-items-center rounded-full text-body transition-colors hover:bg-surface-soft hover:text-ink"
                >
                  <Bell className="h-6 w-6" strokeWidth={1.75} />
                </button>
              </Dropdown>
              <span aria-hidden className="h-8 w-px bg-hairline" />
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
