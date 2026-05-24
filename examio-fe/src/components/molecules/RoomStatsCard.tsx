import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface RoomStatsCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  iconColor?: string;
  iconBgColor?: string;
}

export function RoomStatsCard({
  icon: Icon,
  label,
  value,
  iconColor = "text-coral",
  iconBgColor = "bg-coral/10",
}: RoomStatsCardProps) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold text-ink">{value}</p>
        </div>
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-lg",
            iconBgColor,
          )}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>
    </div>
  );
}
