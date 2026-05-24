import { HistoryStatsGrid } from "@/components/organisms/k/HistoryStatsGrid";
import { PDFHistoryListSection } from "@/components/organisms/k/PDFHistoryListSection";
import { ExamHistoryListSection } from "@/components/organisms/k/ExamHistoryListSection";
import { RecentActivitySection } from "@/components/organisms/k/RecentActivitySection";
import type { PDFHistoryListItemData } from "@/components/molecules/PDFHistoryListItem";
import type { ExamHistoryListItemData } from "@/components/molecules/ExamHistoryListItem";
import type { RecentActivityItemData } from "@/components/molecules/RecentActivityItem";

interface HistoryStats {
  totalPDFs: number;
  examsCreated: number;
  flashcardSets: number;
  totalStudyHours: number;
}

interface HistoryTemplateProps {
  stats: HistoryStats;
  pdfItems: PDFHistoryListItemData[];
  examItems: ExamHistoryListItemData[];
  activities: RecentActivityItemData[];
  onPdfDownload?: (id: string) => void;
  onPdfDelete?: (id: string) => void;
  onExamClick?: (id: string) => void;
  showPdfHistory?: boolean;
  showExamHistory?: boolean;
  showStats?: boolean;
}

export function HistoryTemplate({
  stats,
  pdfItems,
  examItems,
  activities,
  onPdfDownload,
  onPdfDelete,
  onExamClick,
  showPdfHistory = true,
  showExamHistory = true,
  showStats = true,
}: HistoryTemplateProps) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 mt-4">
          <h1 className="font-display text-2xl tracking-tight text-ink">Quản lý lịch sử</h1>
          <p className="text-xs text-muted-foreground md:text-sm">
            Theo dõi tiến độ và hoạt động học tập của bạn
          </p>
        </div>

        {/* Stats Grid */}
        {showStats && <HistoryStatsGrid stats={stats} />}

        {/* Recent Activity Section */}
        <RecentActivitySection activities={activities} />

        {/* Two Column Layout: PDF History + Exam History */}
        <div className={`mt-6 grid gap-6 ${showPdfHistory && showExamHistory ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
          {showPdfHistory && (
            <PDFHistoryListSection
              items={pdfItems}
              onDownload={onPdfDownload}
              onDelete={onPdfDelete}
            />
          )}
          {showExamHistory && (
            <ExamHistoryListSection
              items={examItems}
              onClick={onExamClick}
            />
          )}
        </div>
      </div>
    </div>
  );
}
