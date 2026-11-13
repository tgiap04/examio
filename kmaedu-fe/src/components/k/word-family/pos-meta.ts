/**
 * Part-of-speech display metadata for the word-family tree.
 *
 * The accent colors are a small categorical palette (like chart series colors),
 * chosen as muted earth tones so they harmonize with the warm cream/coral theme
 * and stay legible on both light and dark canvases. They are used only for the
 * small group dot + tinted chip — never for body text — so contrast is safe.
 */
export interface PosMeta {
  /** Vietnamese label shown as the branch heading. */
  label: string;
  /** Solid accent (dot / thin accents). */
  color: string;
}

const POS_META: Record<string, PosMeta> = {
  noun: { label: "Danh từ", color: "#d92d29" }, // brand red (theme primary)
  verb: { label: "Động từ", color: "#c17d3a" }, // amber-terracotta
  adjective: { label: "Tính từ", color: "#6d8a5a" }, // sage
  adverb: { label: "Trạng từ", color: "#9c6079" }, // dusty plum
  pronoun: { label: "Đại từ", color: "#5a7d8a" }, // slate blue
  preposition: { label: "Giới từ", color: "#8a7a5a" }, // taupe
};

const FALLBACK: PosMeta = { label: "Khác", color: "#8a8580" };

/** Resolve display metadata for a POS string (case/whitespace tolerant). */
export function posMeta(pos: string): PosMeta {
  const key = pos?.toLowerCase().trim();
  const meta = POS_META[key];
  if (meta) return meta;
  // Unknown POS: title-case the raw value so it still reads cleanly.
  const label = pos ? pos.charAt(0).toUpperCase() + pos.slice(1) : FALLBACK.label;
  return { label, color: FALLBACK.color };
}

/** Stable display order for the branches (known POS first, then the rest). */
export const POS_ORDER = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
];
