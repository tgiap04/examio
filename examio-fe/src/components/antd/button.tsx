import * as React from "react";
import { Button as AntButton } from "antd";
import type { ButtonProps as AntButtonProps } from "antd";
import { cn } from "@/lib/utils";

type LegacyVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "success" | "warning" | "info" | "dark" | "light" | "gradient" | "glass" | "error" | "errorGhost";
type LegacySize = "default" | "sm" | "lg" | "icon";
type NativeButtonType = "button" | "submit" | "reset";

export interface ButtonProps extends Omit<AntButtonProps, "size" | "type" | "variant"> {
  variant?: LegacyVariant;
  size?: LegacySize;
  asChild?: boolean;
  type?: NativeButtonType;
}

const variantClasses: Partial<Record<LegacyVariant, string>> = {
  secondary: "!border-hairline !bg-surface-card !text-ink hover:!bg-surface-cream-strong",
  outline: "!border-hairline !bg-canvas !text-ink hover:!bg-surface-card",
  ghost: "!border-transparent !bg-transparent !text-ink !shadow-none hover:!bg-surface-card",
  link: "!h-auto !border-transparent !bg-transparent !p-0 !text-primary !shadow-none hover:!text-coral-active",
  success: "!border-success !bg-success !text-white hover:!brightness-95",
  warning: "!border-warning !bg-warning !text-white hover:!brightness-95",
  info: "!border-accent-teal !bg-accent-teal !text-white hover:!brightness-95",
  dark: "!border-surface-dark !bg-surface-dark !text-on-dark hover:!bg-surface-dark-elevated",
  light: "!border-hairline !bg-canvas !text-ink hover:!bg-surface-card",
  gradient: "!border-transparent !bg-primary !text-primary-foreground hover:!bg-coral-active",
  glass: "!border-hairline !bg-surface-card/80 !text-ink !backdrop-blur hover:!bg-surface-cream-strong",
  errorGhost: "!border-transparent !bg-transparent !text-destructive !shadow-none hover:!bg-destructive/10",
};

function buttonVariants({ variant, size, className }: { variant?: LegacyVariant; size?: LegacySize; className?: string } = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors [&>svg]:pointer-events-none [&>svg]:size-4 [&>svg]:shrink-0 focus-visible:!ring-2 focus-visible:!ring-primary/15",
    size === "icon" && "!h-10 !w-10 !p-0",
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
