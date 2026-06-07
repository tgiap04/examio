import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  labelKey: string;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/admin", labelKey: "nav.overview", end: true },
  { to: "/admin/stats", labelKey: "nav.stats" },
  { to: "/admin/users", labelKey: "nav.users" },
  { to: "/admin/finance", labelKey: "nav.finance" },
  { to: "/admin/logs", labelKey: "nav.logs" },
  { to: "/admin/audit", labelKey: "nav.audit" },
];

export function AdminLayout() {
  const { t } = useTranslation("admin");
  const { user, logout } = useAuthStore();
  const location = useLocation();

  const currentTitle = (() => {
    const match = NAV_ITEMS.find((item) =>
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
    <div className="flex min-h-screen w-full bg-[#faf9f5] text-ink">
      <aside className="hidden w-64 shrink-0 border-r border-hairline bg-[#faf9f5] md:flex md:flex-col">
        <div className="flex h-16 items-center border-b border-hairline px-5 text-lg font-semibold">
          Examio Admin
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "block rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-coral/10 font-medium text-coral"
                    : "text-ink/70 hover:bg-surface-card hover:text-ink",
                )
              }
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-hairline bg-[#faf9f5] px-4 md:px-8">
          <h1 className="truncate text-base font-semibold md:text-lg">
            {currentTitle}
          </h1>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink/70 sm:inline">
              {user?.name || user?.username || "Admin"}
            </span>
            <span className="rounded-full bg-coral/10 px-2 py-0.5 text-xs font-medium text-coral">
              Admin
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-[#faf9f5] px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-card"
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
