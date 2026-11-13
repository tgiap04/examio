import { cn } from "@/lib/utils";

/**
 * Shared look of the /k and admin sidebars (reference mock, 2026-11-13): a gradient brand card, section labels with a
 * trailing rule, roomy 15px items with 22px line icons, and the active item on a soft pink gradient with a red bar
 * on its left edge (an inset shadow, so the bar follows the rounded corners).
 */
export const SIDEBAR_WIDTH = 300;
export const SIDEBAR_WIDTH_COLLAPSED = 72;

export const sidebarShellClass = "border-r border-hairline bg-canvas";

export const brandCardClass =
  "relative overflow-hidden rounded-2xl bg-gradient-to-r from-canvas via-[#fff6f5] to-[#fde6e4] ring-1 ring-brand-border/60 shadow-[0_8px_24px_rgba(217,45,41,0.08)]";

export function sidebarItemClass(active: boolean, collapsed = false) {
  return cn(
    "group relative flex w-full items-center rounded-xl text-[15px] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral",
    "[&_svg]:h-[22px] [&_svg]:w-[22px] [&_svg]:stroke-[1.6]",
    collapsed ? "h-11 justify-center" : "h-11 gap-4 px-3",
    active
      ? "bg-gradient-to-r from-[#fde4e2] to-[#fef3f2] font-semibold text-brand-strong shadow-[inset_4px_0_0_var(--coral)]"
      : "font-normal text-body-strong hover:bg-surface-soft hover:text-ink",
  );
}

export function sidebarIconClass(active: boolean) {
  return cn(
    "flex shrink-0 items-center justify-center transition-colors duration-200",
    active ? "text-coral" : "text-muted-foreground group-hover:text-body",
  );
}

/** Section heading: small uppercase label followed by a hairline that runs to the edge. */
export const sidebarSectionLabelClass =
  "flex items-center gap-3 px-3 pb-2 pt-5 text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground after:h-px after:flex-1 after:bg-hairline";

/** Pink promo / call-to-action card at the bottom of the sidebar. */
export const promoCardClass =
  "group flex items-center gap-2.5 rounded-2xl bg-gradient-to-br from-[#fde8e6] to-[#fef6f5] p-3 transition-shadow duration-200 hover:shadow-[0_6px_18px_rgba(217,45,41,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral";

/** White outlined card (quick-search shortcut). */
export const sidebarCardClass = "rounded-2xl border border-hairline bg-canvas";
