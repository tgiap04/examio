import { Button } from "@/components/antd/button";
import { Card, CardContent } from "@/components/antd/card";
import { QuizOptionRow } from "@/components/molecules/QuizOptionRow";
import { StandardMarkdownRenderer } from "@/components/molecules/StandardMarkdownRenderer";
import { formatDuration } from "@/lib/quiz-practice/progress";
import type { AttemptWithQuestions, ResultQuestion } from "@/apis/quizPracticeApi";

interface PracticeResultProps {
  result: AttemptWithQuestions<ResultQuestion>;
  onPracticeAgain: () => void;
}

/** After submit: the score the server computed and every question with its key. */
export function PracticeResult({ result, onPracticeAgain }: PracticeResultProps) {
  const { attempt, questions } = result;
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div>
            <p className="text-sm text-muted-foreground">Điểm</p>
            <p className="text-4xl font-semibold text-ink">{attempt.score ?? 0}/10</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Đúng {attempt.correctAnswers ?? 0}/{attempt.totalQuestions} câu · {formatDuration(attempt.timeSpentSeconds)}
            </p>
          </div>
          <Button onClick={onPracticeAgain}>Luyện tập lại</Button>
        </CardContent>
      </Card>

      {questions.map((q, index) => (
        <Card key={q.id}>
          <CardContent className="pt-6">
            <h3 className="mb-3 font-semibold">Câu {index + 1}</h3>
            <StandardMarkdownRenderer content={q.question} className="mb-4" fontSize={15} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {q.options.map((option, i) => {
                const letter = String.fromCharCode(65 + i);
                const state = optionState(q, letter, option);
                return (
                  <QuizOptionRow
                    key={letter}
                    optionLetter={letter}
                    state={state}
                    content={<StandardMarkdownRenderer content={option} fontSize={13} />}
                  />
                );
              })}
            </div>
            {q.selectedAnswer === null && (
              <p className="mt-3 text-sm text-muted-foreground">Bạn chưa trả lời câu này.</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** The key may be a letter or the option text; the pick may be a letter or text too. */
function optionState(q: ResultQuestion, letter: string, option: string): "correct" | "wrong" | "default" {
  // A single-letter key/pick is a POSITION (even when some option's text is that letter).
  const matches = (value: string | null) => {
    if (value === null) return false;
    const v = value.trim();
    return /^[a-z]$/i.test(v) ? v.toUpperCase() === letter : v === option.trim();
  };
  if (matches(q.correctAnswer)) return "correct";
  if (matches(q.selectedAnswer)) return "wrong";
  return "default";
}
