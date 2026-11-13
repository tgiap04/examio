import * as React from "react";
import { Tag } from "antd";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";

type BadgeProps = React.ComponentProps<"span"> & {
  variant?: BadgeVariant | string;
};

// Tinted badges: light fill, deep text, hairline border in the same hue.
const variantClasses: Record<BadgeVariant, string> = {
  default: "border-brand-border bg-brand-soft text-brand-strong",
  secondary: "border-hairline bg-surface-soft text-body",
  destructive: "border-red-200 bg-red-50 text-red-700",
  outline: "border-hairline bg-canvas text-body",
  success: "border-green-200 bg-green-50 text-green-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-700",
};

function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  return (
    <Tag
      className={cn(
        "!m-0 !inline-flex !h-auto !items-center !gap-1 !whitespace-nowrap !rounded-full !border !px-2 !py-0.5 !text-[11px] !font-medium !leading-4 align-middle transition-colors [&>svg]:pointer-events-none [&>svg]:size-3 [&>svg]:shrink-0",
        variantClasses[variant as BadgeVariant],
        className,
      )}
      {...(props as any)}
    >
      {children}
    </Tag>
  );
}

export { Badge };
