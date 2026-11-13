"use client";
import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Clock as ClockIcon,
  Coins as TokensIcon,
  GraduationCap,
  ArrowRight,
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
import {
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_COLLAPSED,
  promoCardClass,
  sidebarCardClass,
  sidebarIconClass,
  sidebarItemClass,
  sidebarShellClass,
} from "@/components/organisms/nav/sidebar-styles";
import { PromoIllustration, SidebarBrandCard, SidebarSectionLabel } from "@/components/organisms/nav/sidebar-parts";

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

const ICON_CLASS = "h-[22px] w-[22px]";
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

  const sidebarWidth = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH;
  const learnItems = filteredSidebarItems.filter((item) => item.id !== "admin");
  const adminItems = filteredSidebarItems.filter((item) => item.id === "admin");

  const renderItem = (item: SidebarItem) => (
    <li key={item.id} className="relative">
      <Link
        to={item.href}
        aria-current={item.active ? "page" : undefined}
        aria-label={collapsed ? item.label : undefined}
        className={sidebarItemClass(item.active, collapsed)}
      >
        <span className={sidebarIconClass(item.active)}>{item.icon}</span>
        {!collapsed && <span className="truncate">{item.label}</span>}
        {collapsed && (
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-surface-dark px-2 py-1 text-xs font-medium text-on-dark opacity-0 shadow-md transition-opacity group-hover:opacity-100">
            {item.label}
          </span>
        )}
      </Link>
    </li>
  );

  const sectionLabel = (text: string) => <SidebarSectionLabel text={text} collapsed={collapsed} />;
  const focusSearch = () => window.dispatchEvent(new CustomEvent("kmaedu:focus-search"));

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
          className={cn("fixed inset-y-0 left-0 z-50 flex flex-col text-ink transition-[width] duration-200", sidebarShellClass)}
          style={{ width: sidebarWidth }}
        >
          <div className={cn("shrink-0 pt-4", collapsed ? "flex justify-center px-2" : "px-4")}>
            <SidebarBrandCard to="/k" caption="Học viện Kỹ thuật Mật mã" collapsed={collapsed} />
          </div>

          <nav className={cn("flex-1 pb-3 pt-1", collapsed ? "overflow-visible px-3" : "overflow-y-auto overflow-x-hidden px-4")} aria-label="Dashboard navigation">
            {sectionLabel("Học tập")}
            <ul className="space-y-1">{learnItems.map(renderItem)}</ul>
            {adminItems.length > 0 && (
              <>
                {sectionLabel("Quản trị")}
                <ul className="space-y-1">{adminItems.map(renderItem)}</ul>
              </>
            )}
          </nav>

          <div className={cn("shrink-0 space-y-3 pb-4", collapsed ? "px-2" : "px-4")}>
            {!collapsed && (
              <>
                <Link to={learnItems[0]?.href ?? "/k/my-materials"} className={promoCardClass}>
                  <PromoIllustration />
                  <span className="min-w-0 flex-1 leading-snug">
                    <span className="block whitespace-nowrap text-[14px] text-ink">
                      Cùng <span className="font-bold text-coral">KMAEdu</span>
                    </span>
                    <span className="block whitespace-nowrap text-[11.5px] text-body">kiến tạo tương lai tri thức</span>
                  </span>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-canvas text-coral shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition-transform duration-200 group-hover:translate-x-0.5">
                    <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={focusSearch}
                  className={cn(sidebarCardClass, "flex h-11 w-full items-center justify-between gap-2 whitespace-nowrap px-4 text-[13px] text-muted-foreground transition-colors hover:border-brand-border hover:text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral")}
                >
                  <span>Tìm nhanh tài liệu, đề thi</span>
                  <kbd className="rounded-lg bg-surface-card px-2 py-0.5 font-sans text-[12px] font-medium text-body">⌘K</kbd>
                </button>
              </>
            )}
            <div className={cn("flex items-center gap-2", collapsed ? "flex-col" : "px-1 pt-1")}>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <ProfileDropdown data={profile} />
                </div>
              )}
              <div className="group relative">
                <Button
                  type="button"
                  onClick={handleLogout}
                  variant="ghost"
                  size="icon"
                  aria-label="Đăng xuất"
                  className="!h-10 !w-10 !text-body hover:!bg-red-50 hover:!text-red-700 [&>svg]:!size-5"
                >
                  <LogOut />
                </Button>
                <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface-dark px-2 py-1 text-xs font-medium text-on-dark opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                  Đăng xuất
                </span>
              </div>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
