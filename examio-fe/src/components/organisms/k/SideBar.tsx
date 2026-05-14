"use client";
import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import Logo from "@/components/atoms/Logo";
import {
  Bot,
  BookOpen,
  Clock as ClockIcon,
  Coins as TokensIcon,
  GraduationCap,
  LayoutDashboard as DashboardIcon,
  Library,
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
  const { user, getUser } = useAuthStore();
  const [profile, setProfile] = React.useState<Profile>({
    name: "",
    email: "",
    avatar: "",
  });
  const { pathname: currentPath } = useLocation();
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
      name: "Dashboard",
      href: "/k/dashboard-teacher",
      icon: <DashboardIcon className="w-5 h-5" />,
      label: "Dashboard",
      active: currentPath === "/k/dashboard-teacher",
    },
    {
      name: "Dashboard Student",
      href: "/k/dashboard-student",
      icon: <DashboardIcon className="w-5 h-5" />,
      label: "Dashboard",
      active: currentPath === "/k/dashboard-student",
    },
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
      name: "Student Programming",
      href: "/k/student-programming",
      icon: <Bot />,
      label: "Lập trình AI",
      active: currentPath === "/k/student-programming",
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
        <aside className="fixed inset-y-0 left-0 flex w-[250px] flex-col justify-between gap-y-3 border-r border-hairline bg-surface-soft px-4 py-4 text-ink">
          <div className="mt-2 flex flex-col gap-y-4">
            <Logo sizeLogo={28} sizeText={20} />

            <nav
              className="mb-2 flex w-full flex-col gap-y-1.5"
              aria-label="Dashboard navigation"
            >
              {filteredSidebarItems.map((item, index) => (
                <Link
                  key={index}
                  to={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={`group flex w-full items-center gap-x-3 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    item.active
                      ? "border-hairline bg-surface-card text-ink shadow-[0_1px_3px_rgba(20,20,19,0.08)]"
                      : "border-transparent text-muted-foreground hover:bg-surface-card/70 hover:text-ink"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                      item.active
                        ? "bg-coral text-primary-foreground"
                        : "bg-canvas text-muted-foreground group-hover:text-coral"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>

          <div className="mb-2 flex w-full flex-col gap-y-2 border-t border-hairline pt-3">
            <div className="mt-2">
              <ProfileDropdown data={profile} />
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
