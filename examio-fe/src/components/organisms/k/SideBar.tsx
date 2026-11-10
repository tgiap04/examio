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
  DoorOpen as StudyRoomIcon,
} from "lucide-react";
import { FloatingDock } from "@/components/atoms/k/FloatingDock";
import ProfileDropdown from "@/components/atoms/ProfileDropdown";
import { useAuthStore } from "@/stores/useAuthStore";
import { usePageConfigStore } from "@/stores/usePageConfigStore";
import { useCanFn } from "@/hooks/useCan";
import { filterNav } from "@/lib/rbac/nav-items";
import { useEffect } from "react";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { Button } from "@/components/antd/button";
import { cn } from "@/lib/utils";

interface Profile {
  name: string;
  email: string;
  avatar: string;
  model?: string;
}

interface SidebarItem {
  id: string;
  href: string;
  icon: React.ReactNode;
  label: string;
  shortLabel?: string;
  active: boolean;
}

const ICON_CLASS = "w-5 h-5";
const NAV_ICONS: Record<string, React.ReactNode> = {
  "ai-tool": <RocketIcon className={ICON_CLASS} />,
  "word-family": <Network className={ICON_CLASS} />,
  "my-materials": <BookOpen className={ICON_CLASS} />,
  "my-exams": <GraduationCap className={ICON_CLASS} />,
  "manage-exam": <ReaderIcon className={ICON_CLASS} />,
  "flash-card": <CardStackIcon className={ICON_CLASS} />,
  "manage-exam-room": <TokensIcon className={ICON_CLASS} />,
  "study-room": <StudyRoomIcon className={ICON_CLASS} />,
  history: <ClockIcon className={ICON_CLASS} />,
  admin: <AdminIcon className={ICON_CLASS} />,
};

// Which routes light up an item (an item owns its detail pages too).
function isActive(id: string, path: string): boolean {
  switch (id) {
    case "word-family":
      return path.startsWith("/k/word-family");
    case "manage-exam":
      return path === "/k/manage-exam" || path.startsWith("/k/manage-quiz-set") || path.startsWith("/k/practice-quiz");
    case "flash-card":
      return path === "/k/flash-card" || path.startsWith("/k/manage-flashcard-set");
    case "manage-exam-room":
      return path.startsWith("/k/manage-exam-room");
    case "study-room":
      return path.startsWith("/k/study-room");
    case "history":
      return path === "/k/history" || path.startsWith("/k/history/");
    case "admin":
      return path === "/admin";
    default:
      return path === `/k/${id}`;
  }
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

  const can = useCanFn();
  // Permission AND page flag (config + filter in lib/rbac/nav-items.ts).
  const filteredSidebarItems: SidebarItem[] = filterNav(can, pageMap).map((item) => ({
    ...item,
    icon: NAV_ICONS[item.id],
    active: isActive(item.id, currentPath),
  }));

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  // For mobile FloatingDock
  const primaryDockItems = filteredSidebarItems
    .slice(0, 5)
    .map(({ id, href, icon, shortLabel, label, active }) => ({
      name: id,
      href,
      icon,
      label: shortLabel || label,
      active,
    }));

  const secondaryDockItems = [
    ...filteredSidebarItems
      .slice(5)
      .map(({ id, href, icon, label, active }) => ({
        name: id,
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
            <Link to="/k" aria-label="Examio" className="flex items-center">
              <Logo sizeLogo={collapsed ? 40 : 34} sizeText={22} showText={!collapsed} />
            </Link>
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
