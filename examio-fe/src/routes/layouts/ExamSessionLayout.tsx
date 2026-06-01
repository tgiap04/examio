import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import Logo from "@/components/atoms/Logo";
import ProfileDropdown from "@/components/atoms/ProfileDropdown";
import { useAuthStore } from "@/stores/useAuthStore";
import { useThemeContext } from "@/provider/ThemeProvider";

/**
 * Layout for exam session pages — minimal chrome:
 * - Header: logo + back-to-workspace + theme toggle + profile dropdown
 * - Footer: reCAPTCHA notice + copyright
 * - No sidebar, no marketing nav
 */
export function ExamSessionLayout({ children }: PropsWithChildren) {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { isDarkMode, setTheme } = useThemeContext();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);

  const profile = {
    name: user?.name || user?.username || "Người dùng",
    email: user?.email || "",
    avatar: user?.avatar || "",
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-ink">
      <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/k/my-exams")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-hairline bg-surface-soft text-muted-foreground transition-colors hover:bg-surface-card hover:text-ink"
              aria-label="Về trang quản lý kỳ thi"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <Link to="/k/my-exams" className="flex items-center">
              <Logo sizeLogo={36} sizeText={18} />
            </Link>
          </div>

          <div className="flex items-center gap-2">
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

      <main className="flex flex-1 flex-col">{children}</main>

      <footer className="mt-auto border-t border-hairline py-4 text-center text-xs text-muted-foreground">
        <p>
          This site is protected by Cloudflare Turnstile. See{" "}
          <a
            href="https://www.cloudflare.com/privacypolicy/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-body"
          >
            Privacy Policy
          </a>{" "}
          and{" "}
          <a
            href="https://www.cloudflare.com/website-terms-of-use/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-body"
          >
            Terms of Service
          </a>{" "}
          apply.
        </p>
        <p className="mt-2">
          © {new Date().getFullYear()} Examio. All rights reserved. Made with love in Vietnam.
        </p>
      </footer>
    </div>
  );
}
