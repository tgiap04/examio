import { memo } from "react";
import { FileText, CheckCircle, HelpCircle } from "lucide-react";
import { StatCard } from "@/components/molecules/StatCard";

interface ExamStatsData {
  totalExams: number;
  totalExamsTrend: number;
  activeExams: number;
  activeExamsTrend: number;
  totalQuestions: number;
  totalQuestionsTrend: number;
  completionRate: number;
  completionRateTrend: number;
}

interface ExamStatsSectionProps {
  stats: ExamStatsData;
}

const ExamStatsSectionComponent = ({ stats }: ExamStatsSectionProps) => {
  return (
    <div className="grid grid-cols-3 gap-2 mb-8">
      <StatCard
        title="Tổng số đề"
        value={stats.totalExams}
        icon={FileText}
        iconColor="text-coral"
        iconBgColor="bg-coral/10"
        trend={stats.totalExamsTrend}
        className="flex-1"
      />
      <StatCard
        title="Đề đang hoạt động"
        value={stats.activeExams}
        icon={CheckCircle}
        iconColor="text-success"
        iconBgColor="bg-success/10"
        trend={stats.activeExamsTrend}
        className="flex-1"
      />
      <StatCard
        title="Tổng câu hỏi"
        value={stats.totalQuestions}
        icon={HelpCircle}
        iconColor="text-accent-amber"
        iconBgColor="bg-accent-amber/10"
        trend={stats.totalQuestionsTrend}
        className="flex-1"
      />
    </div>
  );
};

ExamStatsSectionComponent.displayName = "ExamStatsSection";

export const ExamStatsSection = memo(ExamStatsSectionComponent);
