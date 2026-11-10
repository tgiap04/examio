import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface HistoryStatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  iconClassName?: string;
}

export function HistoryStatCard({
  title,
  value,
  icon: Icon,
  iconClassName,
}: HistoryStatCardProps) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-bold text-ink">{value}</p>
        </div>
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-lg",
            iconClassName || "bg-coral/10 text-coral",
          )}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
