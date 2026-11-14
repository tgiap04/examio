import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/antd/button";
import { Skeleton } from "@/components/antd/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/antd/tabs";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";
import { listAttemptsApi, type AttemptHistoryItem } from "@/apis/quizPracticeApi";
import { unansweredCount } from "@/lib/quiz-practice/progress";
import { AccessCodeForm } from "./components/quiz-practice/AccessCodeForm";
import { PracticeHistory } from "./components/quiz-practice/PracticeHistory";
import { PracticeResult } from "./components/quiz-practice/PracticeResult";
import { QuestionNavigator } from "./components/quiz-practice/QuestionNavigator";
import { QuestionPanel } from "./components/quiz-practice/QuestionPanel";
import { usePracticeSession } from "./components/quiz-practice/usePracticeSession";

export default function QuizPracticePage() {
  const { id = "" } = useParams();
  const s = usePracticeSession(id);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [history, setHistory] = useState<AttemptHistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState(false);

  const loadHistory = useCallback(() => {
    setHistoryError(false);
    listAttemptsApi({ quizSetId: id, limit: 20 })
      .then((r) => setHistory(r.attempts))
      .catch(() => setHistoryError(true));
  }, [id]);

  useEffect(() => {
    if (s.phase === "intro" || s.phase === "result") loadHistory();
  }, [s.phase, loadHistory]);

  const title = s.access?.title ?? "Luyện tập";
  const current = s.questions[s.progress.currentIndex];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl tracking-tight text-ink md:text-3xl">{title}</h1>
        <Button variant="outline" size="sm" asChild>
          <Link to="/k/my-materials">Tài liệu của tôi</Link>
        </Button>
      </div>

      {s.phase === "loading" && <Skeleton className="h-64 w-full rounded-lg" />}

      {s.phase === "unavailable" && (
        <p className="py-16 text-center text-muted-foreground">
          {s.problem ?? "Bộ câu hỏi không tồn tại hoặc bạn chưa được cấp quyền truy cập."}
        </p>
      )}

      {s.phase === "code" && (
        <AccessCodeForm title={title} submitting={s.busy} error={s.problem} locked={s.locked} onSubmit={s.unlock} />
      )}

      {s.phase === "intro" && (
        <Tabs defaultValue="practice">
          <TabsList>
            <TabsTrigger value="practice">Luyện tập</TabsTrigger>
            <TabsTrigger value="history">Lịch sử</TabsTrigger>
          </TabsList>
          <TabsContent value="practice">
            <div className="space-y-3 py-6">
              <p className="text-muted-foreground">{s.access?.questionCount ?? 0} câu hỏi. Đáp án chỉ hiện sau khi bạn nộp bài.</p>
              <p className="text-sm text-muted-foreground">Nếu bạn đang làm dở, bài sẽ được tiếp tục từ chỗ dừng.</p>
              {s.problem && <p className="text-sm text-destructive">{s.problem}</p>}
              <Button onClick={s.start} disabled={s.busy}>
                {s.busy ? "Đang tải..." : "Bắt đầu / Tiếp tục"}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="history">
            <PracticeHistory attempts={history} error={historyError} onOpen={s.openAttempt} onRetry={loadHistory} />
          </TabsContent>
        </Tabs>
      )}

      {s.phase === "practice" && current && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <QuestionPanel
              question={current}
              index={s.progress.currentIndex}
              total={s.questions.length}
              selected={s.progress.answers[current.id] ?? ""}
              marked={s.progress.markedQuestions.includes(current.id)}
              onSelect={(letter) => s.select(current.id, letter)}
              onToggleMark={() => s.mark(current.id)}
            />
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => s.go(s.progress.currentIndex - 1)} disabled={s.progress.currentIndex === 0}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Câu trước
              </Button>
              {s.progress.currentIndex < s.questions.length - 1 ? (
                <Button onClick={() => s.go(s.progress.currentIndex + 1)}>
                  Câu sau
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={() => setConfirmSubmit(true)} disabled={s.busy}>
                  Nộp bài
                </Button>
              )}
            </div>
            {s.problem && <p className="text-sm text-destructive">{s.problem}</p>}
          </div>
          <div className="space-y-3">
            <QuestionNavigator questions={s.questions} currentIndex={s.progress.currentIndex} progress={s.progress} onGo={s.go} />
            <Button className="w-full" variant="outline" onClick={() => setConfirmSubmit(true)} disabled={s.busy}>
              Nộp bài
            </Button>
          </div>
        </div>
      )}

      {s.phase === "result" && s.result && (
        <div className="space-y-6">
          <PracticeResult result={s.result} onPracticeAgain={s.backToIntro} />
          <PracticeHistory attempts={history} error={historyError} onOpen={s.openAttempt} onRetry={loadHistory} />
        </div>
      )}

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="Nộp bài?"
        description={`Bạn còn ${unansweredCount(s.questions, s.progress.answers)} câu chưa trả lời. Sau khi nộp bạn không thể sửa bài.`}
        confirmText="Nộp bài"
        isLoading={s.busy}
        onConfirm={async () => {
          await s.submit();
          setConfirmSubmit(false);
        }}
      />
    </div>
  );
}
