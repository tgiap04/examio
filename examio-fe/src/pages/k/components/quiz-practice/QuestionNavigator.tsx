import { Flag } from "lucide-react";
import { Card, CardContent } from "@/components/antd/card";
import { cn } from "@/lib/utils";
import {
  answeredCount,
  navigatorState,
  type NavigatorState,
  type PracticeProgress,
} from "@/lib/quiz-practice/progress";
import type { PracticeQuestion } from "@/apis/quizPracticeApi";

const STYLE: Record<NavigatorState, string> = {
  current: "ring-2 ring-primary ring-offset-2 bg-muted",
  marked: "bg-warning/20 text-ink",
  answered: "bg-primary text-primary-foreground",
  empty: "bg-muted hover:bg-muted/80",
};

interface QuestionNavigatorProps {
  questions: PracticeQuestion[];
  currentIndex: number;
  progress: Pick<PracticeProgress, "answers" | "markedQuestions">;
  onGo: (index: number) => void;
}

export function QuestionNavigator({ questions, currentIndex, progress, onGo }: QuestionNavigatorProps) {
  return (
    <Card className="sticky">
      <CardContent className="pt-6">
        <h3 className="mb-4 font-semibold">Danh sách câu hỏi</h3>
        <div className="grid max-h-80 grid-cols-5 gap-2 overflow-y-auto p-1">
          {questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => onGo(i)}
              aria-label={`Câu ${i + 1}`}
              className={cn(
                "relative aspect-square rounded-md text-sm font-medium transition-colors",
                STYLE[navigatorState(q, i, currentIndex, progress)],
              )}
            >
              {i + 1}
              {progress.markedQuestions.includes(q.id) && <Flag className="absolute right-1 top-1 h-3 w-3" />}
            </button>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Đã trả lời {answeredCount(questions, progress.answers)}/{questions.length}
        </p>
      </CardContent>
    </Card>
  );
}
