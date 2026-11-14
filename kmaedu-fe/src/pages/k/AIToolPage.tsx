import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileText, HelpCircle, Layers } from "lucide-react";
import type { Config, DriveStep } from "driver.js";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { FlashcardGenerator } from "@/components/organisms/k/FlashcardGenerator";
import { TestGenerator } from "@/components/organisms/k/TestGenerator";
import { RecentFilesCard } from "@/components/organisms/k/ai-tool/recent-files-card";
import { useTestGeneratorStore, useFlashcardGeneratorStore } from "@/stores/useAIGeneratorStore";
import { cn } from "@/lib/utils";

const AI_TOOL_TOUR_STORAGE_KEY = "kmaedu:tour:ai-tool:v1";

const aiToolTourConfig: Config = {
  animate: true,
  smoothScroll: true,
  showProgress: true,
  progressText: "{{current}}/{{total}}",
  nextBtnText: "Tiếp",
  prevBtnText: "Quay lại",
  doneBtnText: "Xong",
  popoverClass: "kmaedu-driver-popover",
  popoverOffset: 14,
  stagePadding: 8,
  stageRadius: 16,
  overlayOpacity: 0.48,
};

function getAvailableTourSteps(steps: DriveStep[]) {
  return steps.filter((step) => {
    if (typeof step.element !== "string") return true;
    return document.querySelector(step.element);
  });
}

const MODES = [
  { key: "test", label: "Đề kiểm tra", icon: FileText, tour: undefined },
  { key: "flashcard", label: "Flashcard", icon: Layers, tour: "ai-tool-flashcard-tab" },
] as const;

function AIGeneratorContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") === "flashcard" ? "flashcard" : "test";
  const [activeTab, setActiveTab] = useState<string>(tabFromUrl);
  const isTestGenerating = useTestGeneratorStore((s) => s.isGenerating);
  const isFlashcardGenerating = useFlashcardGeneratorStore((s) => s.isGenerating);
  const isAnyGenerating = isTestGenerating || isFlashcardGenerating;

  const tourSteps = useMemo<DriveStep[]>(() => [
    {
      element: "[data-tour='ai-tool-upload']",
      popover: {
        title: "Upload file PDF",
        description: "Kéo thả hoặc chọn PDF để AI đọc nội dung và tạo học liệu.",
        side: "bottom",
        align: "center",
      },
    },
    {
      element: "[data-tour='ai-tool-count']",
      popover: {
        title: "Chỉnh số lượng",
        description: "Điều chỉnh số câu hỏi hoặc số thẻ flashcard muốn tạo.",
        side: "bottom",
        align: "center",
      },
    },
    {
      element: "[data-tour='ai-tool-advanced']",
      popover: {
        title: "Định dạng nâng cao",
        description: "Bật tùy chọn này để tập trung nội dung vào từ khóa cụ thể trong tài liệu.",
        side: "bottom",
        align: "center",
      },
    },
    {
      element: "[data-tour='ai-tool-preview']",
      popover: {
        title: "Preview kết quả",
        description: "Kết quả tạo từ AI sẽ hiển thị ở đây để bạn kiểm tra trước khi lưu.",
        side: "left",
        align: "center",
      },
    },
    {
      element: "[data-tour='ai-tool-recents']",
      popover: {
        title: "File gần đây",
        description: "Chọn lại file đã tải lên để tạo tiếp mà không cần upload lại.",
        side: "bottom",
        align: "center",
      },
    },
    {
      element: "[data-tour='ai-tool-flashcard-tab']",
      popover: {
        title: "Tab Flashcard",
        description: "Chuyển sang tab này để tạo bộ thẻ ghi nhớ từ cùng luồng upload và cấu hình.",
        side: "bottom",
        align: "center",
      },
    },
  ], []);

  const startAiToolTour = useCallback((force = false) => {
    if (!force && localStorage.getItem(AI_TOOL_TOUR_STORAGE_KEY) === "done") return;

    const availableSteps = getAvailableTourSteps(tourSteps);
    if (!availableSteps.length) return;

    const driverObj = driver({
      ...aiToolTourConfig,
      steps: availableSteps,
      onDestroyed: () => localStorage.setItem(AI_TOOL_TOUR_STORAGE_KEY, "done"),
    });

    driverObj.drive();
    return driverObj;
  }, [tourSteps]);

  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  useEffect(() => {
    let activeTour: ReturnType<typeof startAiToolTour>;
    const timeoutId = window.setTimeout(() => {
      activeTour = startAiToolTour();
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);
      activeTour?.destroy();
    };
  }, [startAiToolTour]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    navigate(`/k/ai-tool?tab=${tab}`, { replace: true });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Loại học liệu" className="inline-flex rounded-full border border-hairline bg-canvas p-1" data-tour="ai-tool-tabs">
          {MODES.map(({ key, label, icon: Icon, tour }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                data-tour={tour}
                onClick={() => handleTabChange(key)}
                disabled={isAnyGenerating && !active}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full px-5 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  active ? "bg-brand-soft text-brand-strong" : "text-body hover:text-ink",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => startAiToolTour(true)}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-hairline bg-canvas px-4 text-[13px] font-medium text-body transition-colors hover:border-brand-border hover:text-ink"
        >
          <HelpCircle className="h-4 w-4" />
          Hướng dẫn nhanh
        </button>
      </div>

      {activeTab === "flashcard"
        ? <FlashcardGenerator aside={<RecentFilesCard disabled={isAnyGenerating} />} />
        : <TestGenerator aside={<RecentFilesCard disabled={isAnyGenerating} />} />}
    </div>
  );
}

export default function AIToolPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AIGeneratorContent />
    </Suspense>
  );
}
