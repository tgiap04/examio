import * as React from "react";
import { Button as AntButton } from "antd";
import type { ButtonProps as AntButtonProps } from "antd";
import { cn } from "@/lib/utils";

type LegacyVariant = "default" | "solid" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "success" | "warning" | "info" | "dark" | "light" | "gradient" | "glass" | "error" | "errorGhost";
type LegacySize = "default" | "sm" | "lg" | "icon";
type NativeButtonType = "button" | "submit" | "reset";

export interface ButtonProps extends Omit<AntButtonProps, "size" | "type" | "variant"> {
  variant?: LegacyVariant;
  size?: LegacySize;
  asChild?: boolean;
  type?: NativeButtonType;
}

// Tinted by default (light red fill, deep red text) — the 2026 SaaS look; `solid` keeps one strong CTA per view.
const SOFT_BRAND =
  "!border-brand-border !bg-brand-soft !text-brand-strong !shadow-none hover:!border-brand-soft-hover hover:!bg-brand-soft-hover hover:!text-brand-strong";
const SOLID_BRAND =
  "!border-coral !bg-coral !text-white !shadow-none hover:!border-coral-active hover:!bg-coral-active hover:!text-white";

const variantClasses: Partial<Record<LegacyVariant, string>> = {
  default: SOFT_BRAND,
  solid: SOLID_BRAND,
  gradient: SOLID_BRAND,
  secondary: "!border-hairline !bg-surface-soft !text-ink !shadow-none hover:!bg-surface-card",
  outline: "!border-hairline !bg-canvas !text-ink !shadow-none hover:!border-surface-cream-strong hover:!bg-surface-soft",
  light: "!border-hairline !bg-canvas !text-ink !shadow-none hover:!bg-surface-soft",
  glass: "!border-hairline !bg-canvas/80 !text-ink !shadow-none !backdrop-blur hover:!bg-surface-soft",
  ghost: "!border-transparent !bg-transparent !text-ink !shadow-none hover:!bg-surface-soft",
  link: "!h-auto !border-transparent !bg-transparent !p-0 !text-brand-strong !shadow-none hover:!text-coral-active",
  destructive: "!border-red-200 !bg-red-50 !text-red-700 !shadow-none hover:!border-red-300 hover:!bg-red-100 hover:!text-red-800",
  error: "!border-red-200 !bg-red-50 !text-red-700 !shadow-none hover:!border-red-300 hover:!bg-red-100 hover:!text-red-800",
  errorGhost: "!border-transparent !bg-transparent !text-red-700 !shadow-none hover:!bg-red-50",
  success: "!border-green-200 !bg-green-50 !text-green-700 !shadow-none hover:!bg-green-100",
  warning: "!border-amber-200 !bg-amber-50 !text-amber-800 !shadow-none hover:!bg-amber-100",
  info: "!border-sky-200 !bg-sky-50 !text-sky-700 !shadow-none hover:!bg-sky-100",
  dark: "!border-surface-dark !bg-surface-dark !text-on-dark !shadow-none hover:!bg-surface-dark-elevated",
};

function buttonVariants({ variant, size, className }: { variant?: LegacyVariant; size?: LegacySize; className?: string } = {}) {
  return cn(
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap !rounded-lg !text-[13px] font-medium transition-colors duration-150 [&>svg]:pointer-events-none [&>svg]:size-4 [&>svg]:shrink-0 focus-visible:!ring-2 focus-visible:!ring-coral/20 disabled:!cursor-not-allowed disabled:!opacity-50",
    size === "sm" && "!text-xs",
    size === "icon" && "!h-8 !w-8 !p-0",
    variantClasses[variant ?? "default"],
    className,
  );
}

const sizeMap: Record<LegacySize, AntButtonProps["size"]> = {
  default: "middle",
  sm: "small",
  lg: "large",
  icon: "middle",
};

function getType(variant?: LegacyVariant): AntButtonProps["type"] {
  if (variant === "ghost" || variant === "errorGhost") return "text";
  if (variant === "link") return "link";
  if (variant === "outline" || variant === "glass" || variant === "light" || variant === "secondary") return "default";
  return "primary";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size = "default", asChild, danger, children, type, htmlType, ...props }, ref) => {
    const classNames = buttonVariants({ variant, size, className });
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<any>;
      return React.cloneElement(child, {
        ...props,
        className: cn(child.props.className, classNames),
        onClick: props.onClick ?? child.props.onClick,
      });
    }

    return (
      <AntButton
        ref={ref as any}
        type={getType(variant)}
        htmlType={htmlType ?? type}
        size={sizeMap[size]}
        danger={danger || variant === "destructive" || variant === "error" || variant === "errorGhost"}
        className={classNames}
        {...props}
      >
        {children}
      </AntButton>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
