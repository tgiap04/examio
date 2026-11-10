import type { WordFamilyWord } from "@/types/wordFamily";

interface HighlightedWordProps {
  word: WordFamilyWord;
  /** Larger, spaced-out rendering for the detail modal. */
  size?: "sm" | "lg";
}

/**
 * Renders a word with its shared root softly highlighted and the prefix/suffix
 * in coral, so the family relationship reads at a glance. Reused by the tree
 * leaf card and the detail modal.
 */
export function HighlightedWord({ word, size = "sm" }: HighlightedWordProps) {
  const { affix } = word;
  const prefixLen = affix?.prefix?.length || 0;
  const suffixLen = affix?.suffix?.length || 0;
  const rootLen = word.word.length - prefixLen - suffixLen;

  const rootPad = size === "lg" ? "px-1" : "px-[3px]";

  if (!affix || (prefixLen === 0 && suffixLen === 0) || rootLen <= 0) {
    return <span className="font-semibold text-ink">{word.word}</span>;
  }

  return (
    <span className="font-medium tracking-tight">
      {prefixLen > 0 && (
        <span className="text-coral">{word.word.slice(0, prefixLen)}</span>
      )}
      <span className={`rounded-[4px] bg-coral/10 font-bold text-ink ${rootPad}`}>
        {word.word.slice(prefixLen, prefixLen + rootLen)}
      </span>
      {suffixLen > 0 && (
        <span className="text-coral">{word.word.slice(prefixLen + rootLen)}</span>
      )}
    </span>
  );
}
