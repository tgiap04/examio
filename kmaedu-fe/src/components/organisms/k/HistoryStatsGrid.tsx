import { memo } from "react";
import { HistoryStatCard } from "@/components/molecules/HistoryStatCard";
import { FileText, ClipboardList, BookOpen, Clock } from "lucide-react";

interface HistoryStats {
  totalPDFs: number;
  examsCreated: number;
  flashcardSets: number;
  totalStudyHours: number;
}

interface HistoryStatsGridProps {
  stats: HistoryStats;
}

const HistoryStatsGridComponent = ({ stats }: HistoryStatsGridProps) => {
  return (
    <div className="grid grid-cols-1 gap-2 mb-8 sm:grid-cols-2 lg:grid-cols-4">
      <HistoryStatCard
        title="Tổng PDF đã xử lý"
        value={stats.totalPDFs}
        icon={FileText}
        iconClassName="bg-coral/10 text-brand-strong"
      />
      <HistoryStatCard
        title="Đề thi đã tạo"
        value={stats.examsCreated}
        icon={ClipboardList}
        iconClassName="bg-accent-amber/10 text-accent-amber"
      />
      <HistoryStatCard
        title="Bộ Flashcard"
        value={stats.flashcardSets}
        icon={BookOpen}
        iconClassName="bg-success/10 text-success"
      />
      <HistoryStatCard
        title="Giờ học tổng cộng"
        value={stats.totalStudyHours}
        icon={Clock}
        iconClassName="bg-accent-teal/10 text-accent-teal"
      />
    </div>
  );
};

HistoryStatsGridComponent.displayName = "HistoryStatsGrid";

export const HistoryStatsGrid = memo(HistoryStatsGridComponent);
