import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileText, HelpCircle, History, Loader2, Sparkles, SquareSplitVertical, X } from "lucide-react";
import type { Config, DriveStep } from "driver.js";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import type { RecentUpload } from "@/apis/aiApi";
import { FlashcardGenerator } from "@/components/organisms/k/FlashcardGenerator";
import { TestGenerator } from "@/components/organisms/k/TestGenerator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/antd/alert-dialog";
import { Card, CardContent } from "@/components/antd/card";
import { useRecentUploadsStore, useTestGeneratorStore, useFlashcardGeneratorStore } from "@/stores/useAIGeneratorStore";
import { Tabs } from "antd";
import { useIsMobile } from "@/hooks/useMediaQuery";

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

function formatFileSize(bytes: number) {
  if (!bytes) return "0 KB";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function AIGeneratorContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") || "test";
  const [activeTab, setActiveTab] = useState(tabFromUrl);
  const [uploadToDelete, setUploadToDelete] = useState<RecentUpload | null>(null);

  const {
    recentUploads,
    isLoading,
    isDeleting,
    selectedUpload,
    fetchRecentUploads,
    loadFromUpload,
    deleteUpload,
  } = useRecentUploadsStore();
  const isMobile = useIsMobile();
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
    void fetchRecentUploads();
  }, [fetchRecentUploads]);

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

  const confirmDelete = async () => {
    if (!uploadToDelete) return;
    await deleteUpload(uploadToDelete.id);
    setUploadToDelete(null);
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_16%_10%,rgba(204,120,92,0.14),transparent_32%),radial-gradient(circle_at_84%_8%,rgba(93,184,166,0.10),transparent_28%)]" />

      <section className="relative mx-auto max-w-7xl px-0 py-6 md:py-8 md:px-6 pt-8">
        <div className="bg-background p-0 md:p-6 rounded-lg">
          <div className="hidden md:flex items-center justify-between gap-3 text-sm text-muted-foreground mb-3 px-4 md:px-0">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <span>Workspace tạo học liệu từ PDF</span>
            </div>
            <button
              type="button"
              onClick={() => startAiToolTour(true)}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Hướng dẫn nhanh
            </button>
          </div>

          <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            className="ai-tool-tabs"
            data-tour="ai-tool-tabs"
            tabBarStyle={!isMobile ? { padding: "0 0px", margin: 0 } : { padding: "0 16px", margin: 0 }}
            items={[
              {
                key: "test",
                label: (
                  <span className="inline-flex items-center gap-2 font-medium text-sm">
                    <FileText className="h-4 w-4 shrink-0" />
                    Đề kiểm tra
                  </span>
                ),
                children: (
                  <div className="px-4 md:px-0 -mt-4">
                    <TestGenerator />
                  </div>
                ),
              },
              {
                key: "flashcard",
                label: (
                  <span data-tour="ai-tool-flashcard-tab" className="inline-flex items-center gap-2 font-medium text-sm">
                    <SquareSplitVertical className="h-4 w-4 shrink-0" />
                    Flashcard
                  </span>
                ),
                children: (
                  <div className="px-4 md:px-0 -mt-4">
                    <FlashcardGenerator />
                  </div>
                ),
              },
            ]}
          />

          <div className="px-4 md:px-0">
            <Card className="!mt-4 border-border bg-card shadow-none" data-tour="ai-tool-recents">
              <CardContent className="p-4 md:p-5">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                      <History className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="font-serif text-2xl font-normal leading-tight tracking-[-0.02em] text-foreground">
                        File gần đây
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Chọn lại tài liệu đã tải lên hoặc xóa khỏi lịch sử.
                      </p>
                    </div>
                  </div>
                  <span className="w-fit rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                    {recentUploads.length} file
                  </span>
                </div>

                {isLoading ? (
                  <div className="flex min-h-20 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang tải file gần đây...
                  </div>
                ) : recentUploads.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-background px-4 py-6 text-center text-sm text-muted-foreground">
                    Chưa có file nào. Upload PDF để danh sách xuất hiện tại đây.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2.5">
                    {recentUploads.map((upload) => {
                      const isSelected = selectedUpload?.id === upload.id;

                      return (
                        <div
                          key={upload.id}
                          className={[
                            "group inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1.5 text-sm transition-colors",
                            isSelected
                              ? "border-primary/35 bg-primary/10 text-foreground"
                              : "border-border bg-background text-foreground hover:border-primary/25 hover:bg-primary/5",
                          ].join(" ")}
                        >
                          <button
                            type="button"
                            onClick={() => loadFromUpload(upload)}
                            disabled={isAnyGenerating}
                            className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-full px-1 text-left disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <FileText className="h-4 w-4 shrink-0 text-primary" />
                            <span className="min-w-0 max-w-[18rem] truncate font-medium">
                              {upload.filename}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatFileSize(upload.size)}
                            </span>
                            {upload.quizHistory && (
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {upload.quizHistory.quizCount}Q
                              </span>
                            )}
                            {upload.flashcardHistory && (
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {upload.flashcardHistory.flashcardCount}FC
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            aria-label={`Xóa ${upload.filename}`}
                            onClick={() => setUploadToDelete(upload)}
                            disabled={isAnyGenerating}
                            className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-error/10 hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <AlertDialog open={!!uploadToDelete} onOpenChange={(open) => !open && setUploadToDelete(null)}>
        <AlertDialogContent className="border-border bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa file gần đây?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa file &quot;{uploadToDelete?.filename}&quot;? Hành động này sẽ xóa cả lịch sử đề kiểm tra và flashcard đã tạo từ file này.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={confirmDelete}
              className="bg-error text-destructive-foreground hover:bg-error/90 px-4"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xóa file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
