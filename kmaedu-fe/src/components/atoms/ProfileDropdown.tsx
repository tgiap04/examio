"use client";

import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Clock, LogOut, Shield, User as PersonIcon } from "lucide-react";
import { useCan } from "@/hooks/useCan";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { Dropdown } from "antd";
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
  const [open, setOpen] = React.useState(false);
  const { logout, roles } = useAuthStore();
  const canAdmin = useCan("admin:access");
  const compact = variant === "header";
  const roleBadges = [
    roles.includes("TEACHER") ? "Giáo viên" : roles.includes("STUDENT") ? "Học sinh" : null,
    roles.includes("SYSTEM_ADMIN") ? "Quản trị viên" : null,
  ].filter((label): label is string => Boolean(label));
  const menuLinks = [
    { to: "/k/profile", icon: PersonIcon, label: "Hồ sơ cá nhân", hint: "Ảnh, tên và thông tin tài khoản" },
    { to: "/k/history", icon: Clock, label: "Lịch sử học tập", hint: "Bài đã làm và hoạt động gần đây" },
    ...(canAdmin ? [{ to: "/admin", icon: Shield, label: "Trang quản trị", hint: "Người dùng, phân quyền, nhật ký" }] : []),
  ];

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate("/");
  };

  return (
    <div className={cn("relative", className)} {...props}>
      <Dropdown
        open={open}
        onOpenChange={setOpen}
        trigger={["click"]}
        placement={compact ? "bottomRight" : "topLeft"}
        popupRender={() => (
          <div
            role="menu"
            className="w-80 rounded-2xl border border-hairline bg-canvas p-2 text-ink shadow-[0_16px_40px_rgba(15,23,42,0.14)]"
          >
              {/* identity card, same pink gradient as the sidebar brand card */}
              <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#fde8e6] to-[#fff7f6] p-3">
                <span aria-hidden className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-brand-soft-hover/80 blur-2xl" />
                <div className="relative flex items-center gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft ring-2 ring-canvas shadow-[0_2px_8px_rgba(217,45,41,0.15)]">
                    {data.avatar ? (
                      <img src={data.avatar} alt={data.name} width={48} height={48} className="h-full w-full object-cover" />
                    ) : (
                      <Facehash name={data.name} size={48} className="text-coral" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-ink">{data.name}</p>
                    <p className="truncate text-xs text-body">{data.email}</p>
                  </div>
                </div>
                {roleBadges.length > 0 && (
                  <div className="relative mt-2.5 flex flex-wrap gap-1.5">
                    {roleBadges.map((label) => (
                      <span key={label} className="rounded-full bg-canvas/80 px-2 py-0.5 text-[11px] font-medium text-brand-strong ring-1 ring-brand-border">
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-1.5 space-y-0.5">
                {menuLinks.map(({ to, icon: Icon, label, hint }) => (
                  <Link
                      key={to}
                      to={to}
                      onClick={() => setOpen(false)}
                      className="group flex items-center gap-3 rounded-xl px-2 py-2 outline-none transition-colors hover:bg-surface-soft focus:bg-surface-soft"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-soft text-body transition-colors group-hover:bg-brand-soft group-hover:text-brand-strong group-focus:bg-brand-soft group-focus:text-brand-strong">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block text-[14px] font-medium text-ink">{label}</span>
                        <span className="block truncate text-[12px] text-muted-foreground">{hint}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-soft transition-transform group-hover:translate-x-0.5 group-hover:text-body" />
                    </Link>
                ))}
              </div>

              <div className="mx-1 my-1.5 h-px bg-hairline" />

              <button
                  type="button"
                  onClick={handleLogout}
                  className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left outline-none transition-colors hover:bg-red-50 focus:bg-red-50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600 transition-colors group-hover:bg-red-100">
                    <LogOut className="h-[18px] w-[18px]" />
                  </span>
                  <span className="text-[14px] font-medium text-red-700">Đăng xuất</span>
              </button>
          </div>
        )}
      >
        <button
            type="button"
            aria-label="Tài khoản"
            className={cn(
              "flex w-full items-center rounded-lg text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral",
              compact
                ? "w-auto rounded-full transition-shadow hover:shadow-[0_0_0_4px_rgba(217,45,41,0.12)]"
                : "gap-2.5",
            )}
          >
            <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft", compact ? "h-11 w-11 ring-2 ring-brand-border shadow-[0_2px_8px_rgba(217,45,41,0.15)]" : "h-11 w-11 ring-2 ring-canvas shadow-[0_2px_8px_rgba(217,45,41,0.15)]")}>
              {data.avatar ? (
                <img
                  src={data.avatar}
                  alt={data.name}
                  width={44}
                  height={44}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Facehash name={data.name} size={44} className="text-coral" />
              )}
            </div>
            {!compact && (
              <span className="flex min-w-0 flex-1 items-center gap-1.5 pl-1">
                <span className="truncate text-[14px] font-medium text-ink">{data.name}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </span>
            )}
          </button>
      </Dropdown>
    </div>
  );
}
