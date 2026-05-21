import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, LogOut, User as UserIcon } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/antd/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/antd/avatar";

export function AuthLayoutShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { user, isAuthenticated, initializing, getUser, logout } =
    useAuthStore();

  useEffect(() => {
    getUser();
  }, [getUser]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const dashboardPath = "/k";

  return (
    <div className="min-h-screen bg-gradient-to-br from-canvas via-surface-soft to-surface-card">
      <div className="sticky top-0 z-40 border-b border-hairline bg-canvas/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-coral/25 bg-coral/10 shadow-sm">
              <img
                src="/examio-lightmode.png"
                alt="Examio"
                className="h-8 w-8 rounded-lg object-cover"
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Examio</p>
              <p className="text-xs text-muted-foreground">Nền tảng học tập cùng AI</p>
            </div>
          </Link>

          {initializing ? (
            <div className="h-10 w-10 animate-pulse rounded-full bg-surface-card" />
          ) : isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              <Link
                to={dashboardPath}
                className="hidden items-center gap-1 rounded-full border border-hairline bg-surface-card px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-cream-strong sm:inline-flex"
              >
                Vào trang chính
                <ChevronRight className="h-4 w-4" />
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 rounded-full border border-hairline bg-canvas px-2 py-1.5 shadow-sm transition-colors hover:bg-surface-soft">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback>
                        {user.username?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden text-left sm:block">
                      <p className="max-w-32 truncate text-sm font-semibold text-ink">
                        {user.username}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Thành viên
                      </p>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Tài khoản</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/k/profile")}>
                    <UserIcon className="h-4 w-4" />
                    Hồ sơ
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(dashboardPath)}>
                    <ChevronRight className="h-4 w-4" />
                    Vào trang chính
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={handleLogout}>
                    <LogOut className="h-4 w-4" />
                    Đăng xuất
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Chưa đăng nhập</div>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
