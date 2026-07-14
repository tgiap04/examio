import type { WordFamilyWord } from "@/types/wordFamily";
import { WordFamilyNode } from "./WordFamilyNode";

interface TreeViewProps {
  rootWord: string;
  words: WordFamilyWord[];
  expandedWords: Set<number>;
  onToggleExpand: (idx: number) => void;
}

/**
 * Tree view displays words grouped by POS (part of speech).
 * Root word at top, POS groups as branches, individual words as leaves.
 */
export function TreeView({
  rootWord,
  words,
  expandedWords,
  onToggleExpand,
}: TreeViewProps) {
  // Group words by POS
  const posGroups = words.reduce<Record<string, { word: WordFamilyWord; idx: number }[]>>(
    (acc, word, idx) => {
      const key = word.pos || "Other";
      if (!acc[key]) acc[key] = [];
      acc[key].push({ word, idx });
      return acc;
    },
    {},
  );

  return (
    <div className="rounded-lg border border-hairline bg-surface-card p-5 md:p-6">
      {/* Root node */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-coral/10 font-display text-base font-semibold text-coral">
          {rootWord.charAt(0).toUpperCase()}
        </div>
        <span className="font-display text-xl font-medium tracking-tight text-ink">
          {rootWord}
        </span>
      </div>

      {/* POS branches */}
      <div className="ml-5 mt-4 space-y-5 border-l border-hairline pl-5">
        {Object.entries(posGroups).map(([pos, items]) => (
          <div key={pos}>
            <div className="mb-2 flex items-center gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[1.5px] text-ink/40">
                {pos}
              </span>
              <div className="h-px flex-1 border-t border-dashed border-hairline" />
            </div>

            <div className="ml-1 space-y-0.5 border-l border-hairline pl-4">
              {items.map(({ word, idx }) => (
                <WordFamilyNode
                  key={idx}
                  word={word}
                  expanded={expandedWords.has(idx)}
                  onToggle={() => onToggleExpand(idx)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
