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
    <div className="rounded-lg border border-hairline bg-surface-card p-4">
      {/* Root node */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-coral/10 text-sm font-bold text-coral">
          {rootWord.charAt(0).toUpperCase()}
        </div>
        <span className="font-display text-lg font-medium text-ink">
          {rootWord}
        </span>
      </div>

      {/* POS branches */}
      <div className="ml-4 mt-3 border-l-2 border-hairline pl-4">
        {Object.entries(posGroups).map(([pos, items]) => (
          <div key={pos} className="mb-3">
            <div className="mb-1 flex items-center gap-2">
              <div className="h-px flex-1 border-t border-dashed border-hairline" />
              <span className="text-xs font-semibold uppercase tracking-wider text-ink/40">
                {pos}
              </span>
              <div className="h-px flex-1 border-t border-dashed border-hairline" />
            </div>

            <div className="ml-4 space-y-1 border-l-2 border-hairline pl-4">
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
