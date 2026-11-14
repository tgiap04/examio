import { memo } from "react";
import { Link } from "react-router-dom";
import {
  PDFHistoryListItem,
  type PDFHistoryListItemData,
} from "@/components/molecules/PDFHistoryListItem";

interface PDFHistoryListSectionProps {
  items: PDFHistoryListItemData[];
  onDownload?: (id: string) => void;
  onDelete?: (id: string) => void;
  maxItems?: number;
}

const PDFHistoryListSectionComponent = ({
  items,
  onDownload,
  onDelete,
  maxItems = 4,
}: PDFHistoryListSectionProps) => {
  const displayItems = items.slice(0, maxItems);

  return (
    <div className="h-full rounded-lg border border-hairline bg-canvas p-4">
      <div className="mb-4 flex items-start justify-between gap-4 border-b border-hairline pb-4">
        <div>
          <h2 className="text-lg font-medium text-ink">Lịch sử xử lý PDF</h2>
          <p className="text-sm text-muted-foreground">
            Các file PDF tải lên gần đây
          </p>
        </div>
        <Link
          to="/k/history/pdf"
          className="text-sm font-medium text-coral transition-colors hover:text-coral/80">
          Xem tất cả
        </Link>
      </div>

      <div className="divide-y divide-hairline">
        {displayItems.length > 0 ? (
          displayItems.map((item) => (
            <PDFHistoryListItem
              key={item.id}
              item={item}
              onDownload={onDownload}
              onDelete={onDelete}
            />
          ))
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Chưa có lịch sử PDF
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

PDFHistoryListSectionComponent.displayName = "PDFHistoryListSection";

export const PDFHistoryListSection = memo(PDFHistoryListSectionComponent);
