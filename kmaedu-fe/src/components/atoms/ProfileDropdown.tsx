"use client";

import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, User as PersonIcon } from "lucide-react";
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
            aria-label="Tài khoản"
            className={cn(
              "flex w-full items-center rounded-lg text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral",
              compact
                ? "h-9 w-9 justify-center rounded-full hover:ring-2 hover:ring-brand-border"
                : "gap-2.5",
            )}
          >
            <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft", compact ? "h-8 w-8 ring-1 ring-hairline" : "h-11 w-11 ring-2 ring-canvas shadow-[0_2px_8px_rgba(217,45,41,0.15)]")}>
              {data.avatar ? (
                <img
                  src={data.avatar}
                  alt={data.name}
                  width={compact ? 32 : 44}
                  height={compact ? 32 : 44}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Facehash name={data.name} size={compact ? 32 : 44} className="text-coral" />
              )}
            </div>
            {!compact && (
              <span className="flex min-w-0 flex-1 items-center gap-1.5 pl-1">
                <span className="truncate text-[14px] font-medium text-ink">{data.name}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </span>
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side={compact ? "bottom" : "top"}
          align="end"
          sideOffset={8}
          className="z-[1000] w-60 rounded-xl border border-hairline bg-canvas p-1.5 text-ink shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-ink">{data.name}</p>
            <p className="truncate text-xs text-muted-foreground">{data.email}</p>
          </div>

          <DropdownMenuSeparator className="my-2 bg-hairline" />

          <DropdownMenuItem asChild>
            <Link
              to="/k/profile"
              className="flex min-h-9 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-body transition-colors hover:bg-surface-soft hover:text-ink focus:bg-surface-soft"
            >
              <PersonIcon className="h-4 w-4 text-coral" />
              Hồ sơ
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
