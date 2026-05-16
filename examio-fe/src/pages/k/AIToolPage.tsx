import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileText, History, Loader2, Sparkles, SquareSplitVertical, X } from "lucide-react";
import type { RecentUpload } from "@/apis/aiApi";
import { FlashcardGenerator } from "@/components/organisms/k/FlashcardGenerator";
import { TestGenerator } from "@/components/organisms/k/TestGenerator";
import { TeacherRoute } from "@/components/organisms/TeacherRoute";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/antd/tabs";
import { useRecentUploadsStore } from "@/stores/useAIGeneratorStore";

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

  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  useEffect(() => {
    void fetchRecentUploads();
  }, [fetchRecentUploads]);

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

      <section className="relative mx-auto max-w-6xl px-4 py-6 md:py-8">
        <div className="bg-background p-4 md:p-6 rounded-lg">
          <Tabs
            id="ai-generator-tabs"
            value={activeTab}
            onValueChange={handleTabChange}
            className="ai-tool-tabs w-full gap-5"
          >
            <div className="mb-5 flex flex-col gap-3">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span>Workspace tạo học liệu từ PDF</span>
              </div>
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl border border-border bg-card p-1">
                <TabsTrigger
                  value="test"
                  className="flex items-center justify-center gap-2 rounded-lg px-3 font-medium text-sm"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span>Đề kiểm tra</span>
                </TabsTrigger>
                <TabsTrigger
                  value="flashcard"
                  className="flex items-center justify-center gap-2 rounded-lg px-3 font-medium text-sm"
                >
                  <SquareSplitVertical className="h-4 w-4 shrink-0" />
                  <span>Flashcard</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="test" className="m-0">
              <TestGenerator />
            </TabsContent>

            <TabsContent value="flashcard" className="m-0">
              <FlashcardGenerator />
            </TabsContent>
          </Tabs>

          <Card className="!mt-4 border-border bg-card shadow-none">
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
                          className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-full px-1 text-left"
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
                          className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-error/10 hover:text-error"
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
    <TeacherRoute>
      <Suspense fallback={<div>Loading...</div>}>
        <AIGeneratorContent />
      </Suspense>
    </TeacherRoute>
  );
}
