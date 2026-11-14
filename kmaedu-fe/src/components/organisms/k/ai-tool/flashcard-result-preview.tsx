import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResultPager } from "./ai-tool-ui";

interface PreviewCard {
  question: string;
  answer: string;
}

function CardFace({ label, content, hint, back = false }: { label: string; content: string; hint?: string; back?: boolean }) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl border px-6 py-8 text-center md:px-10",
        back ? "border-brand-border bg-gradient-to-br from-[#fde4e2] to-[#fef6f5]" : "border-hairline bg-canvas",
      )}
      style={{ backfaceVisibility: "hidden", transform: back ? "rotateY(180deg)" : undefined }}
    >
      <span className="rounded-full bg-brand-soft px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-brand-strong">{label}</span>
      <p className="max-h-48 overflow-y-auto text-[18px] font-semibold leading-relaxed text-ink md:text-[20px]">{content}</p>
      {hint && (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <RotateCw className="h-3.5 w-3.5" />
          {hint}
        </span>
      )}
    </div>
  );
}

/** Generated flashcards: pager on top and a card that flips between question and answer. */
export function FlashcardResultPreview({
  cards,
  current,
  onChange,
}: {
  cards: PreviewCard[];
  current: number;
  onChange: (index: number) => void;
}) {
  const [flipped, setFlipped] = useState(false);
  useEffect(() => setFlipped(false), [current]);

  const card = cards[current];
  if (!card) return null;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <ResultPager current={current} total={cards.length} unit="Thẻ" onPrev={() => onChange(current - 1)} onNext={() => onChange(current + 1)} />

      <div className="flex flex-1 items-center justify-center rounded-2xl border border-hairline-soft bg-surface-soft/60 p-4 md:p-8">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setFlipped((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setFlipped((value) => !value);
            }
          }}
          aria-pressed={flipped}
          aria-label={flipped ? "Xem câu hỏi" : "Xem câu trả lời"}
          className="relative h-[340px] w-full max-w-2xl cursor-pointer rounded-2xl shadow-[0_12px_32px_rgba(15,23,42,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          style={{ perspective: "1200px" }}
        >
          <div
            className="absolute inset-0 transition-transform duration-500 motion-reduce:transition-none"
            style={{ transformStyle: "preserve-3d", transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
          >
            <CardFace label="Câu hỏi" content={card.question} hint="Nhấn để xem câu trả lời" />
            <CardFace label="Câu trả lời" content={card.answer} hint="Nhấn để xem lại câu hỏi" back />
          </div>
        </div>
      </div>
    </div>
  );
}
