"use client";
import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Logo from "@/components/atoms/Logo";
import {
  BookOpen,
  Clock as ClockIcon,
  Coins as TokensIcon,
  GraduationCap,
  Library,
  LogOut,
  PanelsTopLeft as CardStackIcon,
  Rocket as RocketIcon,
  ScrollText as ReaderIcon,
} from "lucide-react";
import { FloatingDock } from "@/components/atoms/k/FloatingDock";
import ProfileDropdown from "@/components/atoms/ProfileDropdown";
import { useAuthStore } from "@/stores/useAuthStore";
import { useEffect } from "react";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { canAccessGenAIKnowledgeManager } from "@/lib/genai-knowledge-access";

interface Profile {
  name: string;
  email: string;
  avatar: string;
  subscription?: string;
  model?: string;
}

export function SidebarKit() {
  const { user, getUser, logout } = useAuthStore();
  const [profile, setProfile] = React.useState<Profile>({
    name: "",
    email: "",
    avatar: "",
  });
  const { pathname: currentPath } = useLocation();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("auth_token")) {
      getUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) {
      setProfile({
        name: user.name || user.username,
        email: user.email,
        avatar: user.avatar || "",
      });
    }
  }, [user]);

  const itemSiderbar = [
    {
      name: "Ai Tool",
      href: "/k/ai-tool",
      icon: <RocketIcon className="w-5 h-5" />,
      label: "Công cụ AI",
      active: currentPath === "/k/ai-tool",
    },
    {
      name: "GenAI Knowledge",
      href: "/k/genai-knowledge",
      icon: <Library className="w-5 h-5" />,
      label: "Kho tri thức GenAI",
      active: currentPath === "/k/genai-knowledge",
      restrictedByPolicy: true,
    },
    {
      name: "My Materials",
      href: "/k/my-materials",
      icon: <BookOpen className="w-5 h-5" />,
      label: "Tài liệu của tôi",
      active: currentPath === "/k/my-materials",
    },
    {
      name: "My Exams",
      href: "/k/my-exams",
      icon: <GraduationCap className="w-5 h-5" />,
      label: "Bài thi của tôi",
      active: currentPath === "/k/my-exams",
    },
    {
      name: "Manage Exam",
      href: "/k/manage-exam",
      icon: <ReaderIcon className="w-5 h-5" />,
      label: "Quản lý Đề thi",
      active:
        currentPath === "/k/manage-exam" ||
        currentPath.startsWith("/k/manage-quiz-set") ||
        currentPath.startsWith("/k/practice-quiz"),
    },
    {
      name: "Flash Card",
      href: "/k/flash-card",
      icon: <CardStackIcon className="w-5 h-5" />,
      label: "Quản lý Flashcard",
      active:
        currentPath === "/k/flash-card" ||
        currentPath.startsWith("/k/manage-flashcard-set"),
    },
    {
      name: "Manage Exam Room",
      href: "/k/manage-exam-room",
      icon: <TokensIcon className="w-5 h-5" />,
      label: "Quản lý Phòng thi",
      active:
        currentPath === "/k/manage-exam-room" ||
        currentPath.startsWith("/k/manage-exam-room"),
    },
    {
      name: "History",
      href: "/k/history",
      icon: <ClockIcon className="w-5 h-5" />,
      label: "Lịch sử",
      active: currentPath === "/k/history",
    },
  ];

  const filteredSidebarItems = itemSiderbar.filter((item) => {
    if (item.restrictedByPolicy) {
      return canAccessGenAIKnowledgeManager(user);
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
    .map(({ name, href, icon, label, active }) => ({
      name,
      href,
      icon,
      label,
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

  return (
    <>
      {/* Mobile: FloatingDock - Only render on mobile */}
      {!isDesktop && (
        <FloatingDock
          className="z-[1000]"
          items={primaryDockItems}
          secondaryItems={secondaryDockItems}
        />
      )}

      {/* Desktop: Sidebar - Only render on desktop */}
      {isDesktop && (
        <aside className="fixed inset-y-0 left-0 flex w-[272px] flex-col border-r border-hairline bg-canvas text-ink">
          <div className="border-b border-hairline px-5 py-5">
            <Logo sizeLogo={34} sizeText={22} />
          </div>

          <nav
            className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4"
            aria-label="Dashboard navigation"
          >
            {filteredSidebarItems.map((item, index) => (
              <Link
                key={index}
                to={item.href}
                aria-current={item.active ? "page" : undefined}
                className={`group flex min-h-11 w-full items-center gap-x-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ${
                  item.active
                    ? "border-hairline bg-surface-card text-ink shadow-[0_1px_3px_rgba(20,20,19,0.08)]"
                    : "border-transparent text-muted-foreground hover:bg-surface-soft hover:text-ink"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors ${
                    item.active
                      ? "bg-coral text-primary-foreground"
                      : "bg-surface-soft text-muted-foreground group-hover:bg-surface-card group-hover:text-coral"
                  }`}
                >
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="border-t border-hairline bg-surface-soft/70 px-4 py-4">
            <div className="rounded-lg border border-hairline bg-canvas p-3">
              <ProfileDropdown data={profile} />
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-surface-dark bg-surface-dark px-3 py-2.5 text-sm font-medium text-on-dark transition-colors hover:bg-surface-dark-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
            >
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
