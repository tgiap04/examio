import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/antd/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  PDFHistoryListItem,
  type PDFHistoryListItemData,
} from "@/components/molecules/PDFHistoryListItem";
import { getPDFHistoryApi, type PDFHistoryItem } from "@/apis/historyApi";
import { storeCache, CacheTTL } from "@/lib/storeCache";
import { useToast } from "@/components/antd/toast";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/antd/breadcrumb";

function transformPDFHistory(items: PDFHistoryItem[]): PDFHistoryListItemData[] {
  return items.map((item) => {
    const quizCount = item.quizHistory?.quizCount ?? 0;
    const flashcardCount = item.flashcardHistory?.flashcardCount ?? 0;

    let description = "";
    if (quizCount > 0 && flashcardCount > 0) {
      description = `Tạo ${flashcardCount} flashcard, ${quizCount} câu hỏi`;
    } else if (quizCount > 0) {
      description = `Tạo ${quizCount} câu hỏi`;
    } else if (flashcardCount > 0) {
      description = `Tạo ${flashcardCount} flashcard`;
    } else if (item.processingStatus === "COMPLETED") {
      description = "Đã xử lý - sẵn sàng tạo nội dung";
    } else if (item.processingStatus === "FAILED") {
      description = "Xử lý thất bại";
    } else {
      description = "Đang xử lý...";
    }

    let status: "completed" | "processing" | "failed";
    if (item.processingStatus === "COMPLETED" || quizCount > 0 || flashcardCount > 0) {
      status = "completed";
    } else if (item.processingStatus === "FAILED") {
      status = "failed";
    } else {
      status = "processing";
    }

    return {
      id: item.id,
      fileName: item.filename,
      description,
      status,
      createdAt: formatTimeAgo(item.createdAt),
    };
  });
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Vừa xong";
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} tuần trước`;
  return `${Math.floor(diffDays / 30)} tháng trước`;
}

async function downloadFile(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Download failed");

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

export default function PDFHistoryPage() {
  const [items, setItems] = useState<PDFHistoryListItemData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;
  const pdfDataMapRef = useRef<Map<string, PDFHistoryItem>>(new Map());
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await storeCache.fetchWithCache(
        storeCache.createKey("history-pdf-full", { limit: 100 }),
        () => getPDFHistoryApi(100),
        { ttl: CacheTTL.FIVE_MINUTES },
      );
      setItems(transformPDFHistory(data));
      const newMap = new Map<string, PDFHistoryItem>();
      data.forEach((item) => newMap.set(item.id, item));
      pdfDataMapRef.current = newMap;
    } catch (error) {
      console.error("Failed to fetch PDF history:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.ceil(items.length / itemsPerPage);
  const paginatedItems = items.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const handleDownload = async (id: string) => {
    const pdfItem = pdfDataMapRef.current.get(id);
    if (!pdfItem) {
      toast.error("Không tìm thấy file PDF");
      return;
    }

    try {
      toast.info("Đang tải file...");
      await downloadFile(pdfItem.url, pdfItem.filename);
      toast.success("Tải file thành công!");
    } catch (error) {
      console.error("Failed to download file:", error);
      toast.error("Không thể tải file. Vui lòng thử lại.");
    }
  };

  const handleDelete = (id: string) => {
    console.log("Delete PDF:", id);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Breadcrumb className="mb-6 mt-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/k/history">Lịch sử</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Lịch sử xử lý PDF</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mb-8 mt-4">
          <h1 className="font-display text-2xl tracking-tight text-ink">Lịch sử xử lý PDF</h1>
          <p className="text-xs text-muted-foreground md:text-sm">Các file PDF tải lên gần đây</p>
        </div>

        <div className="rounded-lg border border-hairline bg-canvas">
          <div className="border-b border-hairline p-4">
            <h2 className="text-lg font-medium text-ink">Danh sách PDF ({items.length})</h2>
          </div>
          <div className="divide-y divide-hairline">
            {paginatedItems.length > 0 ? (
              paginatedItems.map((item) => (
                <PDFHistoryListItem
                  key={item.id}
                  item={item}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                />
              ))
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">Chưa có lịch sử PDF</p>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-hairline px-4 py-4">
              <span className="text-sm text-muted-foreground">
                Trang {page} / {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-8 border-hairline">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Trước
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="h-8 border-hairline">
                  Sau
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
