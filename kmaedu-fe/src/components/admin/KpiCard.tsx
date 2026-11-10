import * as React from "react";
import { cn } from "@/lib/utils";

export type KpiFormat = "number" | "currency-vnd" | "percent" | "raw";

export interface KpiCardProps {
  label: string;
  value: number | null;
  format?: KpiFormat;
  icon?: React.ReactNode;
  className?: string;
  loading?: boolean;
}

const vndFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("vi-VN");

function formatValue(value: number | null, format: KpiFormat): string {
  if (value === null || Number.isNaN(value)) return "—";
  switch (format) {
    case "currency-vnd":
      return vndFormatter.format(value);
    case "percent":
      return `${numberFormatter.format(value)}%`;
    case "raw":
      return String(value);
    case "number":
    default:
      return numberFormatter.format(value);
  }
}

export function KpiCard({ label, value, format = "number", icon, className, loading }: KpiCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg bg-surface-card p-6 transition-colors",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between text-sm text-ink/60">
        <span>{label}</span>
        {icon ? <span className="text-ink/40">{icon}</span> : null}
      </div>
      {loading ? (
        <div className="h-9 w-24 animate-pulse rounded-md bg-hairline/60" aria-hidden="true" />
      ) : (
        <div
          className="font-display text-[36px] font-normal leading-tight tracking-tight text-ink"
          style={{ fontFamily: "var(--font-display, 'Copernicus', 'Tiempos Headline', Garamond, 'Times New Roman', serif)" }}
        >
          {formatValue(value, format)}
        </div>
      )}
    </div>
  );
}
