"use client";

import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Settings, User as PersonIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/antd/dropdown-menu";
import { Facehash } from "facehash";

interface Profile {
  name: string;
  email: string;
  avatar: string;
  subscription?: string;
  model?: string;
}

interface ProfileDropdownProps extends React.HTMLAttributes<HTMLDivElement> {
  data?: Profile;
  variant?: "sidebar" | "header";
}

const SAMPLE_PROFILE_DATA: Profile = {
  name: "Anonymous User",
  email: "user@mail.com",
  avatar: "",
  subscription: "PRO",
};

export default function ProfileDropdown({
  data = SAMPLE_PROFILE_DATA,
  className,
  variant = "sidebar",
  ...props
}: ProfileDropdownProps) {
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const compact = variant === "header";

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className={cn("relative", className)} {...props}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex min-h-11 w-full items-center rounded-lg text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral",
              compact
                ? "justify-center gap-2 border border-hairline bg-surface-soft px-2 hover:bg-surface-card"
                : "justify-between gap-3 hover:bg-surface-soft",
            )}
          >
            {!compact && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium leading-tight text-ink">
                  {data.name}
                </div>
                <div className="truncate text-xs leading-tight text-muted-foreground">
                  {data.email}
                </div>
              </div>
            )}
            <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-hairline bg-surface-card">
              {data.avatar ? (
                <img
                  src={data.avatar}
                  alt={data.name}
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Facehash name={data.name} size={40} className="text-coral" />
              )}
            </div>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side={compact ? "bottom" : "left"}
          align="end"
          sideOffset={8}
          className="z-[1000] w-64 rounded-lg border border-hairline bg-canvas p-2 text-ink shadow-[0_12px_30px_rgba(20,20,19,0.12)]"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-ink">{data.name}</p>
            <p className="truncate text-xs text-muted-foreground">{data.email}</p>
          </div>

          <DropdownMenuSeparator className="my-2 bg-hairline" />

          <DropdownMenuItem asChild>
            <Link
              to="/k/profile"
              className="flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-body transition-colors !text-accent-amber hover:bg-surface-soft hover:text-ink focus:bg-surface-soft"
            >
              <PersonIcon className="h-4 w-4 text-coral" />
              Hồ sơ
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link
              to="/k/settings"
              className="flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-body !text-accent-amber transition-colors hover:bg-surface-soft hover:text-ink focus:bg-surface-soft"
            >
              <Settings className="h-4 w-4 text-accent-amber" />
              Cài đặt
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-2 bg-hairline" />

          <DropdownMenuItem asChild>
            <button
              type="button"
              onClick={handleLogout}
              className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium !text-error transition-colors hover:bg-error/10 focus:bg-error/10"
            >
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
