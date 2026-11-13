import { Link } from "react-router-dom";
import { BookCopy, GraduationCap, Sparkles } from "lucide-react";
import Logo from "@/components/atoms/Logo";
import { cn } from "@/lib/utils";
import { brandCardClass, sidebarSectionLabelClass } from "./sidebar-styles";

/** Top brand card: KMA seal, "KMAEdu" wordmark and a caption. Collapsed: the seal alone. */
export function SidebarBrandCard({ to, caption, collapsed = false }: { to: string; caption: string; collapsed?: boolean }) {
  if (collapsed) {
    return (
      <Link to={to} aria-label="KMAEdu" className="grid h-12 w-12 place-items-center rounded-2xl">
        <Logo sizeLogo={34} sizeText={0} showText={false} />
      </Link>
    );
  }
  return (
    <Link to={to} aria-label="KMAEdu" className={cn(brandCardClass, "flex items-center gap-3 px-3.5 py-3")}>
      {/* soft decorative shape on the right, as in the brand mock */}
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-brand-soft-hover/80 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-12 right-6 h-20 w-20 rotate-45 rounded-3xl bg-canvas/50" />
      <span className="relative shrink-0">
        <Logo sizeLogo={36} sizeText={0} showText={false} />
      </span>
      <span className="relative min-w-0 leading-tight">
        <span className="block text-[20px] font-bold tracking-tight text-ink" style={{ fontFamily: '"Fredoka", var(--font-display)' }}>
          <span className="text-brand">KMA</span>Edu
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-body">{caption}</span>
      </span>
    </Link>
  );
}

export function SidebarSectionLabel({ text, collapsed = false }: { text: string; collapsed?: boolean }) {
  if (collapsed) return <div aria-hidden className="mx-auto my-3 h-px w-7 bg-hairline" />;
  return <p className={sidebarSectionLabelClass}>{text}</p>;
}

/** Small vector stand-in for the "graduation cap on books" illustration (no raster asset needed). */
export function PromoIllustration() {
  return (
    <span aria-hidden className="relative block h-12 w-12 shrink-0">
      <BookCopy className="absolute bottom-0 left-1 h-9 w-9 text-coral" strokeWidth={1.8} fill="#fde4e2" />
      <GraduationCap className="absolute left-3 top-0 h-8 w-8 text-ink" strokeWidth={1.8} fill="#0f172a" />
      <Sparkles className="absolute left-0 top-1 h-3.5 w-3.5 text-coral" strokeWidth={2} />
      <Sparkles className="absolute bottom-1 right-0 h-3 w-3 text-accent-amber" strokeWidth={2} />
    </span>
  );
}
