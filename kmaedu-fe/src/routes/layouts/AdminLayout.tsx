import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  BarChart3,
  Users,
  ShieldCheck,
  ScrollText,
  History,
  BookOpen,
  ToggleLeft,
  LogOut,
  ArrowLeft,
  LayoutGrid,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn } from "@/lib/utils";
import {
  SIDEBAR_WIDTH,
  promoCardClass,
  sidebarIconClass,
  sidebarItemClass,
  sidebarShellClass,
} from "@/components/organisms/nav/sidebar-styles";
import { SidebarBrandCard, SidebarSectionLabel } from "@/components/organisms/nav/sidebar-parts";
import { useCanFn } from "@/hooks/useCan";
import { filterAdminNav, filterNav } from "@/lib/rbac/nav-items";
import { usePageConfigStore } from "@/stores/usePageConfigStore";

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ReactNode;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/admin", labelKey: "nav.overview", icon: <LayoutDashboard className="h-[22px] w-[22px]" />, end: true },
  { to: "/admin/stats", labelKey: "nav.stats", icon: <BarChart3 className="h-[22px] w-[22px]" /> },
  { to: "/admin/users", labelKey: "nav.users", icon: <Users className="h-[22px] w-[22px]" /> },
  { to: "/admin/roles", labelKey: "nav.roles", icon: <ShieldCheck className="h-[22px] w-[22px]" /> },
  { to: "/admin/logs", labelKey: "nav.logs", icon: <ScrollText className="h-[22px] w-[22px]" /> },
  { to: "/admin/audit", labelKey: "nav.audit", icon: <History className="h-[22px] w-[22px]" /> },
  { to: "/admin/word-family", labelKey: "nav.wordFamily", icon: <BookOpen className="h-[22px] w-[22px]" /> },
  { to: "/admin/page-config", labelKey: "nav.pageConfig", icon: <ToggleLeft className="h-[22px] w-[22px]" /> },
];

export function AdminLayout() {
  const { t } = useTranslation("admin");
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const can = useCanFn();
  // Same permission table as the route guards: only links the user can open.
  const allowed = new Set(filterAdminNav(can));
  const navItems = NAV_ITEMS.filter((item) => allowed.has(item.to));
  // Back to the learning workspace: the first /k page this account may open. Not plain "/k", which sends an
  // admin whose base role is STUDENT straight back to /admin (lib/rbac/landing-path.ts).
  const pageMap = usePageConfigStore((s) => s.pages);
  const workspaceHref = filterNav(can, pageMap).find((item) => item.href.startsWith("/k/"))?.href ?? "/k/my-materials";

  const currentTitle = (() => {
    const match = navItems.find((item) =>
      item.end
        ? location.pathname === item.to
        : location.pathname.startsWith(item.to),
    );
    return match ? t(match.labelKey) : t("nav.overview");
  })();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="flex min-h-screen w-full bg-canvas text-ink">
      <aside
        className={cn("hidden shrink-0 md:sticky md:top-0 md:flex md:h-screen md:flex-col", sidebarShellClass)}
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div className="shrink-0 px-4 pt-4">
          <SidebarBrandCard to={workspaceHref} caption={t("nav.consoleCaption")} />
        </div>
        <nav className="flex-1 overflow-y-auto px-4 pb-3 pt-1" aria-label="Admin navigation">
          <SidebarSectionLabel text={t("nav.consoleSection")} />
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className={({ isActive }) => sidebarItemClass(isActive)}>
                  {({ isActive }) => (
                    <>
                      <span className={sidebarIconClass(isActive)}>{item.icon}</span>
                      <span className="truncate">{t(item.labelKey)}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="shrink-0 px-4 pb-4">
          <Link to={workspaceHref} className={promoCardClass}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-canvas text-coral shadow-[0_2px_8px_rgba(217,45,41,0.12)]">
              <LayoutGrid className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block whitespace-nowrap text-[13px] font-semibold text-ink">{t("nav.workspace")}</span>
              <span className="block truncate text-[11.5px] text-body">{t("nav.workspaceHint")}</span>
            </span>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-canvas text-coral shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition-transform duration-200 group-hover:translate-x-0.5">
              <ArrowLeft className="h-4 w-4 rotate-180" strokeWidth={2.4} />
            </span>
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-hairline bg-canvas px-4 md:px-8">
          <h1 className="truncate font-display text-base font-normal tracking-tight md:text-lg">
            {currentTitle}
          </h1>
          <div className="flex items-center gap-3">
            <Link
              to={workspaceHref}
              className="inline-flex items-center gap-1.5 rounded-md border border-brand-border bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand-strong transition-colors hover:bg-brand-soft-hover md:hidden"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("nav.workspaceShort")}
            </Link>
            <span className="hidden text-sm text-ink/70 sm:inline">
              {user?.name || user?.username || "Admin"}
            </span>
            <span className="rounded-pill bg-coral/10 px-2 py-0.5 text-xs font-medium text-brand-strong">
              Admin
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-card"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("actions.logout")}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-x-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
