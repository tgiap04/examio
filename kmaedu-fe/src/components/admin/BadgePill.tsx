import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant = "positive" | "negative" | "neutral";

const variantClasses: Record<BadgeVariant, string> = {
  positive: "bg-coral/10 text-coral",
  negative: "bg-error/10 text-error",
  neutral: "bg-surface-card text-ink/70",
};

interface BadgePillProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function BadgePill({
  variant = "neutral",
  children,
  className,
}: BadgePillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
