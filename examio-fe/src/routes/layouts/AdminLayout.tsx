import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  BarChart3,
  Users,
  ShieldCheck,
  Wallet,
  ScrollText,
  History,
  BookOpen,
  ToggleLeft,
  LogOut,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn } from "@/lib/utils";
import Logo from "@/components/atoms/Logo";
import { useCanFn } from "@/hooks/useCan";
import { filterAdminNav } from "@/lib/rbac/nav-items";

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ReactNode;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/admin", labelKey: "nav.overview", icon: <LayoutDashboard className="h-4 w-4" />, end: true },
  { to: "/admin/stats", labelKey: "nav.stats", icon: <BarChart3 className="h-4 w-4" /> },
  { to: "/admin/users", labelKey: "nav.users", icon: <Users className="h-4 w-4" /> },
  { to: "/admin/roles", labelKey: "nav.roles", icon: <ShieldCheck className="h-4 w-4" /> },
  { to: "/admin/finance", labelKey: "nav.finance", icon: <Wallet className="h-4 w-4" /> },
  { to: "/admin/logs", labelKey: "nav.logs", icon: <ScrollText className="h-4 w-4" /> },
  { to: "/admin/audit", labelKey: "nav.audit", icon: <History className="h-4 w-4" /> },
  { to: "/admin/word-family", labelKey: "nav.wordFamily", icon: <BookOpen className="h-4 w-4" /> },
  { to: "/admin/page-config", labelKey: "nav.pageConfig", icon: <ToggleLeft className="h-4 w-4" /> },
];

export function AdminLayout() {
  const { t } = useTranslation("admin");
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const can = useCanFn();
  // Same permission table as the route guards: only links the user can open.
  const allowed = new Set(filterAdminNav(can));
  const navItems = NAV_ITEMS.filter((item) => allowed.has(item.to));

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
      <aside className="hidden w-64 shrink-0 border-r border-hairline bg-canvas md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-hairline px-5">
          <Link to="/k" aria-label="Examio" className="flex items-center">
            <Logo sizeLogo={28} sizeText={18} showText />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-coral/10 font-medium text-coral"
                    : "text-ink/70 hover:bg-surface-card hover:text-ink",
                )
              }
            >
              <span className="shrink-0">{item.icon}</span>
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-hairline bg-canvas px-4 md:px-8">
          <h1 className="truncate font-display text-base font-normal tracking-tight md:text-lg">
            {currentTitle}
          </h1>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink/70 sm:inline">
              {user?.name || user?.username || "Admin"}
            </span>
            <span className="rounded-pill bg-coral/10 px-2 py-0.5 text-xs font-medium text-coral">
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
