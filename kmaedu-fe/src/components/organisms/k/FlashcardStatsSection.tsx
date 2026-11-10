import { memo } from "react";
import { Layers, Target, Eye } from "lucide-react";
import { StatCard } from "@/components/molecules/StatCard";

interface FlashcardStatsData {
  totalGroups: number;
  totalGroupsTrend: number;
  totalCards: number;
  totalCardsTrend: number;
  totalViews: number;
  totalViewsTrend: number;
}

interface FlashcardStatsSectionProps {
  stats: FlashcardStatsData;
}

const FlashcardStatsSectionComponent = ({ stats }: FlashcardStatsSectionProps) => {
  return (
    <div className="grid grid-cols-3 gap-2 mb-8">
      <StatCard
        title="Tổng số nhóm"
        value={stats.totalGroups}
        icon={Layers}
        iconColor="text-coral"
        iconBgColor="bg-coral/10"
        trend={stats.totalGroupsTrend}
        className="flex-1"
      />
      <StatCard
        title="Tổng số thẻ"
        value={stats.totalCards}
        icon={Target}
        iconColor="text-accent-amber"
        iconBgColor="bg-accent-amber/10"
        trend={stats.totalCardsTrend}
        className="flex-1"
      />
      <StatCard
        title="Tổng lượt xem"
        value={stats.totalViews}
        icon={Eye}
        iconColor="text-success"
        iconBgColor="bg-success/10"
        trend={stats.totalViewsTrend}
        className="flex-1"
      />
    </div>
  );
};

FlashcardStatsSectionComponent.displayName = "FlashcardStatsSection";

export const FlashcardStatsSection = memo(FlashcardStatsSectionComponent);
