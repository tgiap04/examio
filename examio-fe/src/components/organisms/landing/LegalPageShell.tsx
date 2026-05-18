import type { PropsWithChildren } from "react";
import { Sparkles } from "lucide-react";

interface LegalPageShellProps extends PropsWithChildren {
  eyebrow: string;
  title: string;
  lastUpdated: string;
}

export default function LegalPageShell({
  eyebrow,
  title,
  lastUpdated,
  children,
}: LegalPageShellProps) {
  return (
    <div className="overflow-x-hidden bg-canvas">
      <section className="bg-canvas landing-dot-paper pt-28 pb-16 md:pt-32 md:pb-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-[9999px] border border-hairline bg-surface-card px-3 py-1.5">
            <Sparkles className="h-3.5 w-3.5 text-coral" />
            <span className="text-[12px] font-medium uppercase tracking-[1.5px] text-ink">
              {eyebrow}
            </span>
          </div>

          <h1 className="font-display !mt-6 text-[36px] font-medium leading-[1.1] tracking-[-0.02em] text-ink sm:text-[44px] lg:text-[52px]">
            {title}
          </h1>

          <p className="mt-4 text-[13px] text-muted-foreground">
            Cập nhật lần cuối: {lastUpdated}
          </p>
        </div>
      </section>

      <section className="bg-canvas py-8">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="prose-legal space-y-8 text-[15px] leading-[1.7] text-body">
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
