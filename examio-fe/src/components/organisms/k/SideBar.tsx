"use client";
import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Logo from "@/components/atoms/Logo";
import {
  BookOpen,
  Clock as ClockIcon,
  Coins as TokensIcon,
  GraduationCap,
  LogOut,
  Network,
  PanelsTopLeft as CardStackIcon,
  Rocket as RocketIcon,
  ScrollText as ReaderIcon,
  Shield as AdminIcon,
} from "lucide-react";
import { FloatingDock } from "@/components/atoms/k/FloatingDock";
import ProfileDropdown from "@/components/atoms/ProfileDropdown";
import { useAuthStore } from "@/stores/useAuthStore";
import { usePageConfigStore } from "@/stores/usePageConfigStore";
import type { PageKey } from "@/lib/page-keys";
import { useEffect } from "react";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { Button } from "@/components/antd/button";
import { cn } from "@/lib/utils";

interface Profile {
  name: string;
  email: string;
  avatar: string;
  subscription?: string;
  model?: string;
}

interface SidebarItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  label: string;
  shortLabel?: string;
  active: boolean;
  adminOnly?: boolean;
  pageKey?: PageKey;
}

interface SidebarKitProps {
  collapsed?: boolean;
}

export function SidebarKit({ collapsed = false }: SidebarKitProps) {
  const { user, isAuthenticated, getUser, logout } = useAuthStore();
  const [profile, setProfile] = React.useState<Profile>({
    name: "",
    email: "",
    avatar: "",
  });
  const { pathname: currentPath } = useLocation();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  // Subscribe vào map bật/tắt để sidebar tự ẩn/hiện realtime khi admin toggle.
  const pageMap = usePageConfigStore((s) => s.pages);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // SECURITY: "already logged in?" comes from the auth store (hydrated via
    // the httpOnly cookie), never from a localStorage token.
    if (isAuthenticated) {
      getUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (user) {
      setProfile({
        name: user.name || user.username,
        email: user.email,
        avatar: user.avatar || "",
      });
    }
  }, [user]);

  const itemSiderbar: SidebarItem[] = [
    {
      name: "Ai Tool",
      pageKey: "ai-tool",
      href: "/k/ai-tool",
      icon: <RocketIcon className="w-5 h-5" />,
      label: "Công cụ AI",
      shortLabel: "AI",
      active: currentPath === "/k/ai-tool",
    },
    {
      name: "Word Family",
      pageKey: "word-family",
      href: "/k/word-family",
      icon: <Network className="w-5 h-5" />,
      label: "Từ vựng tiếng Anh",
      shortLabel: "Từ vựng",
      active: currentPath.startsWith("/k/word-family"),
    },
    {
      name: "My Materials",
      pageKey: "my-materials",
      href: "/k/my-materials",
      icon: <BookOpen className="w-5 h-5" />,
      label: "Tài liệu của tôi",
      shortLabel: "Tài liệu",
      active: currentPath === "/k/my-materials",
    },
    {
      name: "My Exams",
      pageKey: "my-exams",
      href: "/k/my-exams",
      icon: <GraduationCap className="w-5 h-5" />,
      label: "Bài thi của tôi",
      shortLabel: "Bài thi",
      active: currentPath === "/k/my-exams",
    },
    {
      name: "Manage Exam",
      pageKey: "manage-exam",
      href: "/k/manage-exam",
      icon: <ReaderIcon className="w-5 h-5" />,
      label: "Quản lý Đề thi",
      shortLabel: "Đề thi",
      active:
        currentPath === "/k/manage-exam" ||
        currentPath.startsWith("/k/manage-quiz-set") ||
        currentPath.startsWith("/k/practice-quiz"),
    },
    {
      name: "Flash Card",
      pageKey: "flash-card",
      href: "/k/flash-card",
      icon: <CardStackIcon className="w-5 h-5" />,
      label: "Quản lý Flashcard",
      shortLabel: "Flashcard",
      active:
        currentPath === "/k/flash-card" ||
        currentPath.startsWith("/k/manage-flashcard-set"),
    },
    {
      name: "Manage Exam Room",
      pageKey: "manage-exam-room",
      href: "/k/manage-exam-room",
      icon: <TokensIcon className="w-5 h-5" />,
      label: "Quản lý Phòng thi",
      shortLabel: "Phòng thi",
      active:
        currentPath === "/k/manage-exam-room" ||
        currentPath.startsWith("/k/manage-exam-room"),
    },
    {
      name: "History",
      pageKey: "history",
      href: "/k/history",
      icon: <ClockIcon className="w-5 h-5" />,
      label: "Lịch sử",
      shortLabel: "Lịch sử",
      active: currentPath === "/k/history",
    },
    {
      name: "Admin Dashboard",
      href: "/admin",
      icon: <AdminIcon className="w-5 h-5" />,
      label: "Trang quản trị",
      shortLabel: "Admin",
      active: currentPath === "/admin",
      adminOnly: true,
    },
  ];

  const filteredSidebarItems = itemSiderbar.filter((item) => {
    if (item.adminOnly) {
      return user?.isAdmin === true;
    }

    // Ẩn trang admin đã tắt (default-on: chỉ ẩn khi === false).
    if (item.pageKey && pageMap[item.pageKey] === false) {
      return false;
    }

    return true;
  });

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  // For mobile FloatingDock
  const primaryDockItems = filteredSidebarItems
    .slice(0, 5)
    .map(({ name, href, icon, shortLabel, active }) => ({
      name,
      href,
      icon,
      label: shortLabel || name,
      active,
    }));

  const secondaryDockItems = [
    ...filteredSidebarItems
      .slice(5)
      .map(({ name, href, icon, label, active }) => ({
        name,
        href,
        icon,
        label,
        active,
      })),
  ];

  // Don't render anything until mounted to avoid hydration mismatch
  if (!mounted) {
    return null;
  }

  const sidebarWidth = collapsed ? "w-[72px]" : "w-[272px]";

  return (
    <>
      {/* Mobile/Tablet: FloatingDock */}
      {!isDesktop && (
        <FloatingDock
          className="z-[1000]"
          items={primaryDockItems}
          secondaryItems={secondaryDockItems}
        />
      )}

      {/* Desktop: Sidebar */}
      {isDesktop && (
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex flex-col overflow-visible border-r border-hairline bg-canvas text-ink transition-[width] duration-200",
            sidebarWidth
          )}
        >
          <div className={cn(
            "flex items-center border-b border-hairline px-3 py-4",
            collapsed ? "justify-center" : "justify-start"
          )}>
            <Logo sizeLogo={collapsed ? 40 : 34} sizeText={22} showText={!collapsed} />
          </div>

          <nav
            className="flex-1 space-y-1.5 overflow-visible px-2 py-4"
            aria-label="Dashboard navigation"
          >
            {filteredSidebarItems.map((item, index) => (
              <div key={index} className="relative group">
                <Link
                  to={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 w-full items-center rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral",
                    collapsed ? "justify-center" : "gap-x-3 px-3",
                    item.active
                      ? "border-hairline bg-surface-card text-ink shadow-[0_1px_3px_rgba(20,20,19,0.08)]"
                      : "border-transparent text-muted-foreground hover:bg-surface-soft hover:text-ink"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors",
                      item.active
                        ? "bg-coral text-primary-foreground"
                        : "bg-surface-soft text-muted-foreground group-hover:bg-surface-card group-hover:text-coral"
                    )}
                  >
                    {item.icon}
                  </span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
                {collapsed && (
                  <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-surface-dark px-2.5 py-1.5 text-xs font-medium text-on-dark opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                    {item.label}
                  </span>
                )}
              </div>
            ))}
          </nav>

          <div className={cn("border-t border-hairline bg-surface-soft/70 px-2 py-4", collapsed && "px-1.5")}>
            {!collapsed && (
              <div className="rounded-lg border border-hairline bg-canvas mb-2">
                <ProfileDropdown data={profile} className="p-2" />
              </div>
            )}
            <div className="group relative">
              <Button
                type="button"
                onClick={handleLogout}
                variant="link"
                className={cn(
                  "flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-surface-dark bg-surface-dark text-sm font-medium text-on-dark transition-colors hover:bg-surface-dark-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral",
                  collapsed ? "px-2 py-2.5" : "px-3 py-2.5"
                )}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                {!collapsed && "Đăng xuất"}
              </Button>
              {collapsed && (
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-surface-dark px-2.5 py-1.5 text-xs font-medium text-on-dark opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                  Đăng xuất
                </span>
              )}
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
