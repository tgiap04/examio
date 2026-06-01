"use client";
import * as React from "react";
import { useLayoutEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogOut, Menu, Moon, Sun, User, X } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/antd/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/antd/dropdown-menu";
import { useThemeContext } from "@/provider/ThemeProvider";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn } from "@/lib/utils";
import Logo from "../atoms/Logo";
import LanguageSwitcher from "./language-switcher";

const menuItems = [
  { name: "nav.features", href: "/#features" },
  { name: "nav.about", href: "/about" },
  { name: "nav.contact", href: "/contact" },
];

export default function HeaderSection() {
  const { t } = useTranslation("common");
  const [menuState, setMenuState] = React.useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);
  const navigate = useNavigate();
  const { isDarkMode, setTheme } = useThemeContext();
  const { user, isAuthenticated, initializing, getUser, logout } =
    useAuthStore();

  useLayoutEffect(() => {
    getUser();
  }, [getUser]);

  React.useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleTheme = () => setTheme(isDarkMode ? "light" : "dark");

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="fixed inset-x-0 top-0 z-30">
      <div className="px-3 pt-3 sm:px-6">
        <nav
          data-state={menuState ? "active" : undefined}
          className={cn(
            "mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 rounded-[16px] border px-4 transition-all duration-200 sm:px-5",
            isScrolled
              ? "border-hairline bg-canvas/80 shadow-[0_8px_24px_rgba(20,20,19,0.06)] backdrop-blur"
              : "border-transparent bg-canvas/60 backdrop-blur-sm",
          )}
        >
          <Link to="/" aria-label="Examio" className="flex items-center">
            <Logo sizeLogo={28} sizeText={18} />
          </Link>

          <ul className="hidden items-center gap-7 lg:flex !mt-3">
            {menuItems.map((item) => (
              <li key={item.href}>
                <Link
                  to={item.href}
                  className="text-[14px] font-medium text-body transition-colors hover:text-ink"
                >
                  {t(item.name)}
                </Link>
              </li>
            ))}
            {isAuthenticated && (
              <li>
                <Link
                  to="/k"
                  className="text-[14px] font-medium text-body transition-colors hover:text-ink"
                >
                  {t("nav.tools")}
                </Link>
              </li>
            )}
          </ul>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <IconButton
              onClick={toggleTheme}
              ariaLabel={isDarkMode ? t("nav.themeLight") : t("nav.themeDark")}
            >
              {isDarkMode ? (
                <Sun className="h-4 w-4" strokeWidth={1.75} />
              ) : (
                <Moon className="h-4 w-4" strokeWidth={1.75} />
              )}
            </IconButton>

            <LanguageSwitcher />

            <span className="mx-1 hidden h-5 w-px bg-hairline lg:inline-block" />

            {initializing ? (
              <div className="h-9 w-9 animate-pulse rounded-full bg-surface-card" />
            ) : !isAuthenticated ? (
              <div className="hidden items-center gap-2 sm:flex">
                <Link
                  to="/login"
                  className="text-[14px] font-medium text-ink transition-colors hover:text-coral"
                >
                  {t("nav.login")}
                </Link>
                <Link
                  to="/register"
                  className="inline-flex h-9 items-center rounded-[9999px] bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
                >
                  {t("nav.getStarted")}
                </Link>
              </div>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Avatar className="h-9 w-9 cursor-pointer border border-hairline">
                    <AvatarImage src={user?.avatar} />
                    <AvatarFallback className="bg-surface-card text-[12px] font-medium text-ink">
                      {user?.username?.charAt(0).toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[180px]">
                  <DropdownMenuLabel className="font-semibold">
                    {t("nav.account")}
                  </DropdownMenuLabel>
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => navigate("/k/profile")}>
                      <User className="h-4 w-4" />
                      {t("nav.profile")}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={handleLogout}>
                    <LogOut className="h-4 w-4" />
                    {t("nav.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <button
              type="button"
              onClick={() => setMenuState((s) => !s)}
              aria-label={menuState ? t("nav.menuClose") : t("nav.menuOpen")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[9999px] border border-hairline bg-canvas text-ink transition-colors hover:border-coral/40 hover:bg-surface-card lg:hidden"
            >
              {menuState ? (
                <X className="h-4 w-4" strokeWidth={1.75} />
              ) : (
                <Menu className="h-4 w-4" strokeWidth={1.75} />
              )}
            </button>
          </div>
        </nav>

        {menuState && (
          <div className="mx-auto mt-2 max-w-7xl rounded-[16px] border border-hairline bg-canvas p-4 shadow-[0_18px_40px_rgba(20,20,19,0.08)] lg:hidden">
            <ul className="space-y-3">
              {menuItems.map((item) => (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    onClick={() => setMenuState(false)}
                    className="block py-1 text-[15px] font-medium text-ink"
                  >
                    {t(item.name)}
                  </Link>
                </li>
              ))}
              {isAuthenticated && (
                <li>
                  <Link
                    to="/k"
                    onClick={() => setMenuState(false)}
                    className="block py-1 text-[15px] font-medium text-ink"
                  >
                    {t("nav.tools")}
                  </Link>
                </li>
              )}
            </ul>

            {!isAuthenticated && !initializing && (
              <div className="mt-4 flex items-center gap-2 border-t border-hairline pt-4">
                <Link
                  to="/login"
                  onClick={() => setMenuState(false)}
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-[8px] border border-hairline text-[14px] font-medium text-ink"
                >
                  {t("nav.login")}
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMenuState(false)}
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-[8px] bg-foreground text-[14px] font-medium text-background"
                >
                  {t("nav.getStarted")}
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

function IconButton({
  onClick,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[9999px] border border-hairline bg-canvas text-ink transition-colors hover:border-coral/40 hover:bg-surface-card"
    >
      {children}
    </button>
  );
}
