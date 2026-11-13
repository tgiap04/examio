import { cn } from "@/lib/utils";

interface QuizOptionRowProps {
  optionLetter: string;
  content: React.ReactNode;
  state: "default" | "selected" | "correct" | "wrong" | "skipped";
  onClick?: () => void;
  disabled?: boolean;
}

/**
 * Shared quiz option row used by both quiz mode and result review mode.
 * Uses design system tokens so colors work correctly in both dark and light modes.
 *
 * Colors:
 * - selected / default  → coral theme (border-coral, bg-coral/5, bg-coral/10, text-coral)
 * - correct              → success theme (border-success, bg-success/5, bg-success/10, text-success)
 * - wrong                → destructive theme (border-destructive, bg-destructive/5, bg-destructive/10, text-destructive)
 * - skipped              → neutral (border-border, bg-muted/50, text-muted-foreground)
 */
export function QuizOptionRow({ optionLetter, content, state, onClick, disabled }: QuizOptionRowProps) {
  const isInteractive = !!onClick;

  const containerClass = cn(
    "flex items-center gap-2 p-4 rounded-[10px] border-2 transition-colors",
    isInteractive && "cursor-pointer",
    !isInteractive && "cursor-default",
    state === "selected" && "border-coral bg-coral/5 hover:border-coral/70",
    state === "default" && "border-border hover:border-coral/50",
    state === "correct" && "border-success bg-success/5",
    state === "wrong" && "border-destructive bg-destructive/5",
    state === "skipped" && "border-border bg-muted/50",
  );

  const letterClass = cn(
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 font-mono text-[11px] font-semibold",
    state === "selected" && "border-coral bg-coral/10 text-brand-strong",
    state === "default" && "border-border text-muted-foreground",
    state === "correct" && "border-success bg-success/10 text-success",
    state === "wrong" && "border-destructive bg-destructive/10 text-destructive",
    state === "skipped" && "border-border text-muted-foreground",
  );

  if (isInteractive) {
    return (
      <div
        className={containerClass}
        onClick={disabled ? undefined : onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); }}
      >
        <span className={letterClass}>{optionLetter}</span>
        <span className="flex-1 text-[13px] leading-[1.55]">{content}</span>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <span className={letterClass}>{optionLetter}</span>
      <span className="flex-1 text-[13px] leading-[1.55]">{content}</span>
    </div>
  );
}