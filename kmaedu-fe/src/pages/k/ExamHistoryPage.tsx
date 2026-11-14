import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/antd/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  ExamHistoryListItem,
  type ExamHistoryListItemData,
} from "@/components/molecules/ExamHistoryListItem";
import { getExamHistoryApi, type ExamHistoryItem } from "@/apis/historyApi";
import { storeCache, CacheTTL } from "@/lib/storeCache";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/antd/breadcrumb";

function transformExamHistory(items: ExamHistoryItem[]): ExamHistoryListItemData[] {
  return items.map((item) => ({
    id: item.id,
    examTitle: item.examSession.examRoom.title,
    score: item.score,
    totalQuestions: item.totalQuestions,
    correctAnswers: item.correctAnswers,
    completedAt: `Hoàn thành ${formatTimeAgo(item.finishedAt || item.startedAt)}`,
    passed: item.score >= 50,
  }));
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

export default function ExamHistoryPage() {
  const [items, setItems] = useState<ExamHistoryListItemData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const itemsPerPage = 10;

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const cacheKey = storeCache.createKey("history-exam-page", {
        page,
        limit: itemsPerPage,
      });
      const data = await storeCache.fetchWithCache(
        cacheKey,
        () => getExamHistoryApi(page, itemsPerPage),
        { ttl: CacheTTL.FIVE_MINUTES },
      );
      setItems(transformExamHistory(data.examAttempts));
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (error) {
      console.error("Failed to fetch exam history:", error);
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExamClick = (id: string) => {
    console.log("View exam:", id);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div>
      <div>
        <Breadcrumb className="mb-6 mt-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/k/history">Lịch sử</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Lịch sử làm bài</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mb-8 mt-4">
          <h1 className="font-display text-2xl tracking-tight text-ink">Lịch sử làm bài</h1>
          <p className="text-xs text-muted-foreground md:text-sm">Kết quả các bài thi đã làm</p>
        </div>

        <div className="rounded-lg border border-hairline bg-canvas">
          <div className="border-b border-hairline p-4">
            <h2 className="text-lg font-medium text-ink">Danh sách bài thi ({total})</h2>
          </div>
          <div className="divide-y divide-hairline">
            {items.length > 0 ? (
              items.map((item) => (
                <ExamHistoryListItem key={item.id} item={item} onClick={handleExamClick} />
              ))
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">Chưa có lịch sử bài thi</p>
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
