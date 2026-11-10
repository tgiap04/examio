import { useState } from "react";
import type { WordFamilyWord } from "@/types/wordFamily";
import { HighlightedWord } from "./HighlightedWord";
import { WordDetailModal } from "./WordDetailModal";

interface WordFamilyNodeProps {
  word: WordFamilyWord;
  /** Branch accent color (from the POS group). */
  accent: string;
}

/**
 * A leaf card in the org-chart tree: avatar + word (root highlighted) + short
 * meaning, with a "Chi tiết" footer that opens the full detail in a modal.
 */
export function WordFamilyNode({ word, accent }: WordFamilyNodeProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-[230px] overflow-hidden rounded-2xl border border-hairline bg-canvas shadow-sm transition-shadow duration-150 hover:shadow-md motion-reduce:transition-none">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          {word.word.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] leading-snug">
            <HighlightedWord word={word} />
          </div>
          <div className="truncate text-[12px] leading-snug text-ink/50">
            {word.meaningVi}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full border-t border-hairline px-3.5 py-2 text-center text-[12px] font-medium text-coral transition-colors duration-150 hover:bg-coral/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-coral/40 motion-reduce:transition-none"
      >
        Chi tiết
      </button>

      <WordDetailModal
        open={open}
        word={word}
        accent={accent}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
