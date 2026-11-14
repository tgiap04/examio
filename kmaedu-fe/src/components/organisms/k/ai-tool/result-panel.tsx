import { forwardRef } from "react";
import type { ReactNode } from "react";
import { SaveAll } from "lucide-react";
import ModernLoader from "@/components/antd/modern-loader";
import { cn } from "@/lib/utils";
import { aiPanelClass } from "./ai-tool-ui";

interface ResultPanelProps {
  icon: ReactNode;
  title: string;
  countLabel?: string;
  keyword?: string;
  /** Wraps the "Lưu" button (a save dialog trigger); omitted while there is nothing to save. */
  renderSave?: (button: ReactNode) => ReactNode;
  children: ReactNode;
}

/** Right-hand result card: title row with the save button, the item count pill, then the content. */
export const ResultPanel = forwardRef<HTMLElement, ResultPanelProps>(({ icon, title, countLabel, keyword, renderSave, children }, ref) => {
  const saveButton = (
    <button
      type="button"
      className="inline-flex h-11 items-center gap-2 rounded-full border border-hairline bg-canvas px-5 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-soft"
    >
      <SaveAll className="h-[18px] w-[18px]" />
      Lưu
    </button>
  );

  return (
    <section ref={ref} className={cn(aiPanelClass, "flex min-h-[600px] flex-col p-4 md:p-6")}>
      <div data-tour="ai-tool-preview" className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2.5 text-[20px] font-bold text-ink [&_svg]:h-6 [&_svg]:w-6 [&_svg]:stroke-[1.75] [&_svg]:text-brand">
            {icon}
            {title}
          </h2>
          <p className="mt-1.5 text-[14px] text-body">Xem trước nội dung AI tạo từ tài liệu trước khi lưu.</p>
        </div>
        {renderSave?.(saveButton)}
      </div>

      {countLabel && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-hairline bg-canvas px-3.5 py-1.5 text-[14px] font-semibold text-ink">{countLabel}</span>
          {keyword && <span className="rounded-full border border-brand-border bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand-strong">{keyword}</span>}
        </div>
      )}

      <div className="mt-4 flex flex-1 flex-col">{children}</div>
    </section>
  );
});
ResultPanel.displayName = "ResultPanel";

/** Animated "AI is working" state shared by both generators. */
export function ResultLoading({ itemWord }: { itemWord: string }) {
  return (
    <div className="flex min-h-[360px] flex-1 items-center justify-center rounded-2xl bg-surface-soft px-6">
      <ModernLoader
        words={[
          "Đang phân tích tài liệu…",
          "Trích xuất thông tin…",
          "Hiểu nội dung…",
          "Xác minh dữ liệu…",
          "Suy nghĩ về chủ đề…",
          `Lập kế hoạch ${itemWord}…`,
          `Tạo ${itemWord}…`,
          "Đánh giá đáp án…",
          "Kiểm tra độ chính xác…",
          "Đảm bảo tính đa dạng…",
          "Tối ưu hóa định dạng…",
          "Chuẩn bị để hiển thị…",
        ]}
      />
    </div>
  );
}
