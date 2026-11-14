import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** White rounded panel used by every block of the AI tool page. */
export const aiPanelClass = "rounded-[20px] border border-hairline bg-canvas shadow-[0_4px_20px_rgba(15,23,42,0.04)]";

/** Pink tile holding a red line icon (card headers, recent-files header). */
export function IconTile({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#fde4e2] to-[#fef3f2] text-brand [&_svg]:h-6 [&_svg]:w-6 [&_svg]:stroke-[1.75]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** "1 / 10" counter, red progress bar and round prev/next buttons above a result list. */
export function ResultPager({
  current,
  total,
  onPrev,
  onNext,
  unit,
}: {
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  unit: string;
}) {
  const percent = total ? ((current + 1) / total) * 100 : 0;
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-surface-soft px-4 py-3 md:px-6">
      <p className="shrink-0 text-[17px] font-semibold tabular-nums text-ink" aria-live="polite">
        <span className="text-brand">{current + 1}</span> / {total}
        <span className="sr-only"> {unit}</span>
      </p>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current + 1}>
        <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={current === 0}
          aria-label={`${unit} trước`}
          className="grid h-11 w-11 place-items-center rounded-full border border-hairline bg-canvas text-body-strong transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={current >= total - 1}
          aria-label={`${unit} sau`}
          className="grid h-11 w-11 place-items-center rounded-full bg-brand text-white shadow-[0_6px_14px_rgba(238,47,43,0.3)] transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

/** Centered message shown in the result panel before anything was generated. */
export function ResultEmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex min-h-[360px] flex-1 flex-col items-center justify-center rounded-2xl bg-surface-soft px-6 text-center">
      <IconTile className="mb-4 h-14 w-14">{icon}</IconTile>
      <p className="max-w-md text-sm text-body md:text-base">{text}</p>
    </div>
  );
}
