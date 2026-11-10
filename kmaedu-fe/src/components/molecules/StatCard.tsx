import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  iconColor: string;
  iconBgColor: string;
  trend?: number;
  badge?: string;
  className?: string;
  description?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  iconColor,
  iconBgColor,
  className,
  description,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-lg border border-hairline bg-surface-card p-2 md:p-4 shadow-none max-h-28",
        className
      )}>
      <div className="flex items-start mb-2">
        <div className={cn("rounded-lg py-2.5 pr-2.5 flex items-center justify-center gap-x-2")}>
          <Icon className={cn("h-5 w-5", iconColor)} />
          <div className="text-xs text-muted-foreground md:text-sm line-clamp-2">{title}</div>
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-2xl font-bold text-ink">{value}</div>

        {description && (
          <p className="text-xs text-muted-foreground pt-1">{description}</p>
        )}
      </div>
    </div >
  );
}
