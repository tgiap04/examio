import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type Range = "7d" | "30d" | "90d";

export interface RangeOption {
  value: Range;
  labelKey: string;
}

export interface RangeSelectorProps {
  value: Range;
  onChange: (range: Range) => void;
  className?: string;
}

const OPTIONS: RangeOption[] = [
  { value: "7d", labelKey: "stats.range.7d" },
  { value: "30d", labelKey: "stats.range.30d" },
  { value: "90d", labelKey: "stats.range.90d" },
];

export function RangeSelector({ value, onChange, className }: RangeSelectorProps) {
  const { t } = useTranslation("admin");

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-hairline bg-canvas p-1",
        className,
      )}
      role="tablist"
      aria-label="Khoảng thời gian"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-brand-soft text-brand-strong"
                : "text-ink/70 hover:bg-surface-card hover:text-ink",
            )}
          >
            {t(opt.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
