import { useEffect, useRef, useState } from "react";
import type { Quizz } from "@/types/exam";
import { resolveAnswerIndex } from "@/lib/quizAnswerUtils";
import { cn } from "@/lib/utils";
import { ResultPager } from "./ai-tool-ui";

const OPTION_PREFIX = /^[A-D]\s*[.):]\s+/;

/** Generated questions: pager on top (jumps to a question), scrollable list with the correct option highlighted. */
export function QuizResultList({ questions }: { questions: Quizz[] }) {
  const [current, setCurrent] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => setCurrent(0), [questions]);

  const goTo = (index: number) => {
    const next = Math.min(questions.length - 1, Math.max(0, index));
    setCurrent(next);
    const list = listRef.current;
    const item = itemRefs.current[next];
    if (list && item) list.scrollTo({ top: item.offsetTop - 8, behavior: "smooth" });
  };

  return (
    <div className="flex flex-1 flex-col gap-3">
      <ResultPager current={current} total={questions.length} unit="Câu" onPrev={() => goTo(current - 1)} onNext={() => goTo(current + 1)} />

      <div ref={listRef} className="relative max-h-[620px] min-h-[360px] flex-1 overflow-y-auto rounded-2xl border border-hairline-soft px-3 py-2 md:px-6">
        {questions.map((question, index) => {
          const answerIndex = resolveAnswerIndex(question.answer, question.options);
          return (
            <article
              key={index}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              className={cn("flex gap-4 py-5", index > 0 && "border-t border-hairline-soft")}
            >
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full text-[15px] font-semibold transition-colors",
                  index === current ? "bg-brand text-white" : "bg-brand-soft text-brand",
                )}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="pt-1.5 text-[15px] font-semibold leading-[1.55] text-ink">{question.question}</p>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {question.options.map((option, optionIndex) => {
                    const isCorrect = answerIndex === optionIndex;
                    return (
                      <div
                        key={optionIndex}
                        className={cn(
                          "flex min-h-[44px] items-center gap-3 rounded-xl border px-4 py-2.5 text-[14px] leading-snug",
                          isCorrect ? "border-brand-border bg-brand-soft text-ink" : "border-hairline bg-canvas text-body",
                        )}
                      >
                        {isCorrect ? (
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" aria-label="Đáp án đúng" />
                        ) : (
                          <span className="w-5 shrink-0 text-[13px] font-medium text-muted-foreground">{String.fromCharCode(65 + optionIndex)}.</span>
                        )}
                        <span className="flex-1">{option.replace(OPTION_PREFIX, "")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
