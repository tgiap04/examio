import { ArrowRight, Loader2, Zap } from "lucide-react";

interface GenerateCtaCardProps {
  title: string;
  loadingTitle: string;
  subtitle: string;
  disabled: boolean;
  isLoading: boolean;
  onClick: () => void;
}

/** Pink "generate with AI" card: the single action that starts generation. */
export function GenerateCtaCard({ title, loadingTitle, subtitle, disabled, isLoading, onClick }: GenerateCtaCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={isLoading}
      className="group relative flex w-full items-center gap-4 overflow-hidden rounded-[20px] bg-gradient-to-br from-[#fde4e2] via-[#fdeceb] to-[#fef6f5] px-5 py-5 text-left transition-shadow duration-200 hover:shadow-[0_10px_24px_rgba(238,47,43,0.16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none"
    >
      <span aria-hidden className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-canvas/40 blur-xl" />
      <span className="relative grid h-10 w-10 shrink-0 place-items-center text-brand">
        {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Zap className="h-6 w-6 stroke-[1.75]" />}
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{isLoading ? loadingTitle : title}</span>
        <span className="mt-0.5 block text-[13px] text-body">{subtitle}</span>
      </span>
      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-canvas text-brand shadow-[0_4px_10px_rgba(15,23,42,0.08)] transition-transform duration-200 group-hover:translate-x-0.5 group-disabled:translate-x-0">
        <ArrowRight className="h-5 w-5" />
      </span>
    </button>
  );
}
