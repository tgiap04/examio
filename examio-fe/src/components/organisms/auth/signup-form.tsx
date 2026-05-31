"use client";
import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { normalizeReturnPath } from "@/lib/authRedirect";
import { Label } from "@/components/antd/label";
import { Input } from "@/components/antd/input";
import { cn } from "@/lib/utils";
import { IconBrandGoogle } from "@tabler/icons-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "@/components/antd/toast";

function BottomGradient() {
  return (
    <>
      <span className="group-hover/btn:opacity-100 block transition duration-500 opacity-0 absolute h-px w-full -bottom-px inset-x-0 bg-gradient-to-r from-transparent via-coral to-transparent" />
      <span className="group-hover/btn:opacity-100 blur-sm block transition duration-500 opacity-0 absolute h-px w-1/2 mx-auto -bottom-px inset-x-10 bg-gradient-to-r from-transparent via-accent-amber to-transparent" />
    </>
  );
}

function LabelInputContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col space-y-2 w-full", className)}>
      {children}
    </div>
  );
}

export function SignupForm() {
  const { signup, loginWithGoogle } =
    useAuthStore();
  const [searchParams] = useSearchParams();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const username = formData.get("username") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (password !== (formData.get("confirmPassword") as string)) {
      toast.warning("Mật khẩu nhập lại không khớp!");
      return;
    }

    try {
      const response = await signup({
        username,
        email,
        password,
      });
      const from = normalizeReturnPath(searchParams.get("from"));
      if (response && response.user) {
        window.location.href = from || response.redirectTo || "/k";
      } else {
        window.location.href = from || "/k";
      }
    } catch (error) {
      console.error("Signup failed:", error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas landing-dot-paper py-8 w-full">
      <div className="max-w-md w-full mx-4 rounded-2xl p-6 md:p-8 shadow-xl bg-canvas border relative">
        <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-coral/15 via-surface-card to-transparent opacity-60 blur-3xl -mt-20 rounded-t-2xl"></div>

        <div className="relative">
          <div className="flex flex-col items-center mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-coral/25 bg-coral/10 shadow-sm">
              <img
                src="/examio-lightmode.png"
                alt="Examio"
                className="h-12 w-12 rounded-xl object-cover"
              />
            </div>
            <h2 className="font-bold text-xl text-ink mt-3">
              Chào Mừng Đến Với Examio
            </h2>
            <h1 className="text-3xl font-bold font-display text-coral mt-1">
              Đăng Ký
            </h1>
          </div>


          <form className="space-y-4" onSubmit={handleSubmit}>
            <LabelInputContainer>
              <Label htmlFor="username" className="text-body">
                Tên Đăng Nhập
              </Label>
              <Input
                id="username"
                name="username"
                placeholder="Tên Đăng Nhập"
                type="text"
                className="bg-surface-soft border-hairline focus:ring-primary focus:border-primary"
              />
            </LabelInputContainer>

            <LabelInputContainer>
              <Label htmlFor="email" className="text-body">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                placeholder="email@examio.vn"
                type="email"
                className="bg-surface-soft border-hairline focus:ring-primary focus:border-primary"
              />
            </LabelInputContainer>

            <LabelInputContainer>
              <Label htmlFor="password" className="text-body">
                Mật Khẩu
              </Label>
              <Input
                id="password"
                name="password"
                placeholder="••••••••"
                type="password"
                className="bg-surface-soft border-hairline focus:ring-primary focus:border-primary"
              />
            </LabelInputContainer>

            <LabelInputContainer>
              <Label htmlFor="confirmPassword" className="text-body">
                Nhập Lại Mật Khẩu
              </Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                placeholder="••••••••"
                type="password"
                className="bg-surface-soft border-hairline focus:ring-primary focus:border-primary"
              />
            </LabelInputContainer>

            <button
              className="bg-primary hover:bg-coral-active relative group/btn w-full text-white rounded-lg h-11 font-semibold shadow-lg shadow-primary/30 cursor-pointer transition-all mt-6"
              type="submit"
            >
              Đăng Ký →
              <BottomGradient />
            </button>

            <div className="flex items-center my-6">
              <hr className="flex-grow border-t border-hairline" />
              <span className="px-4 text-sm text-muted-foreground">
                Hoặc đăng ký với
              </span>
              <hr className="flex-grow border-t border-hairline" />
            </div>

            <div className="grid gap-2 grid-cols-1">
              <button
                className="relative group/btn flex space-x-2 items-center justify-center px-4 w-full text-body rounded-lg h-10 font-medium bg-surface-soft border border-hairline hover:bg-surface-card cursor-pointer transition-all"
                type="button"
                onClick={() => loginWithGoogle?.()}
              >
                <IconBrandGoogle className="h-4 w-4" />
                <span className="text-sm">Google</span>
                <BottomGradient />
              </button>
            </div>

            <div className="text-muted-foreground flex justify-center gap-1 text-sm mt-4">
              <p>Đã có tài khoản? </p>
              <Link
                to="/login"
                className="text-primary font-medium hover:underline"
              >
                Đăng Nhập
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
