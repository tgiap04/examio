import { Button } from "@/components/antd/button";
import { Skeleton } from "@/components/antd/skeleton";
import { formatDuration } from "@/lib/quiz-practice/progress";
import type { AttemptHistoryItem } from "@/apis/quizPracticeApi";

interface PracticeHistoryProps {
  attempts: AttemptHistoryItem[] | null;
  error: boolean;
  onOpen: (attemptId: string) => void;
  onRetry: () => void;
}

export function PracticeHistory({ attempts, error, onOpen, onRetry }: PracticeHistoryProps) {
  if (error) {
    return (
      <div className="space-y-3 py-8 text-center">
        <p className="text-sm text-destructive">Không thể tải lịch sử luyện tập</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Thử lại
        </Button>
      </div>
    );
  }
  if (attempts === null) return <Skeleton className="h-32 w-full rounded-lg" />;
  if (attempts.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Bạn chưa nộp bài luyện tập nào.</p>;
  }
  return (
    <ul className="divide-y divide-hairline rounded-lg border border-hairline">
      {attempts.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium text-ink">
              {a.score ?? 0}/10 · đúng {a.correctAnswers}/{a.totalQuestions}
            </p>
            <p className="text-xs text-muted-foreground">
              {a.submittedAt ? new Date(a.submittedAt).toLocaleString("vi-VN") : ""} · {formatDuration(a.timeSpentSeconds)}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpen(a.id)}>
            Xem lại
          </Button>
        </li>
      ))}
    </ul>
  );
}
