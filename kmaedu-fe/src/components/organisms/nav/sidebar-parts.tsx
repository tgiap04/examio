import { Link } from "react-router-dom";
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

/** "Graduation cap on books" illustration of the promo card (public/promo-graduation.webp, background removed). */
export function PromoIllustration() {
  return (
    <img
      src="/promo-graduation.webp"
      alt=""
      aria-hidden
      width={109}
      height={96}
      loading="lazy"
      className="h-12 w-auto shrink-0 object-contain drop-shadow-[0_4px_6px_rgba(217,45,41,0.18)]"
    />
  );
}
