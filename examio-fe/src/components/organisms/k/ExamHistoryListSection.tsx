import { memo } from "react";
import { Link } from "react-router-dom";
import {
  ExamHistoryListItem,
  type ExamHistoryListItemData,
} from "@/components/molecules/ExamHistoryListItem";

interface ExamHistoryListSectionProps {
  items: ExamHistoryListItemData[];
  onClick?: (id: string) => void;
  maxItems?: number;
}

const ExamHistoryListSectionComponent = ({
  items,
  onClick,
  maxItems = 4,
}: ExamHistoryListSectionProps) => {
  const displayItems = items.slice(0, maxItems);

  return (
    <div className="h-full rounded-lg border border-hairline bg-canvas p-4">
      <div className="mb-4 flex items-start justify-between gap-4 border-b border-hairline pb-4">
        <div>
          <h2 className="text-lg font-medium text-ink">Lịch sử làm bài</h2>
          <p className="text-sm text-muted-foreground">
            Kết quả các bài thi đã làm
          </p>
        </div>
        <Link
          to="/k/history/exam"
          className="text-sm font-medium text-coral transition-colors hover:text-coral/80">
          Xem tất cả
        </Link>
      </div>

      <div className="divide-y divide-hairline">
        {displayItems.length > 0 ? (
          displayItems.map((item) => (
            <ExamHistoryListItem
              key={item.id}
              item={item}
              onClick={onClick}
            />
          ))
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Chưa có lịch sử bài thi
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

ExamHistoryListSectionComponent.displayName = "ExamHistoryListSection";

export const ExamHistoryListSection = memo(ExamHistoryListSectionComponent);
