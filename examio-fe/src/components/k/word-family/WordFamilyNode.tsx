import type { WordFamilyWord } from "@/types/wordFamily";
import { CaretDownOutlined, CaretRightOutlined } from "@ant-design/icons";

interface WordFamilyNodeProps {
  word: WordFamilyWord;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Single word node in tree view.
 * Shows word + POS by default; expands to show meaning + example on click.
 * Prefix/suffix are highlighted compared to root.
 */
export function WordFamilyNode({ word, expanded, onToggle }: WordFamilyNodeProps) {
  const { affix } = word;

  // Build highlighted word: prefix | root | suffix
  const renderHighlightedWord = () => {
    if (!affix) return <span>{word.word}</span>;

    const prefixLen = affix.prefix?.length || 0;
    const suffixLen = affix.suffix?.length || 0;
    const rootLen = word.word.length - prefixLen - suffixLen;

    if (prefixLen === 0 && suffixLen === 0) {
      return <span className="font-medium">{word.word}</span>;
    }

    return (
      <span>
        {prefixLen > 0 && (
          <span className="font-medium text-coral/70">
            {word.word.slice(0, prefixLen)}
          </span>
        )}
        <span className="font-bold text-ink">
          {word.word.slice(prefixLen, prefixLen + rootLen)}
        </span>
        {suffixLen > 0 && (
          <span className="font-medium text-coral/70">
            {word.word.slice(prefixLen + rootLen)}
          </span>
        )}
      </span>
    );
  };

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-surface-card"
      >
        {expanded ? (
          <CaretDownOutlined className="text-ink/40" />
        ) : (
          <CaretRightOutlined className="text-ink/40" />
        )}
        {renderHighlightedWord()}
      </button>

      {expanded && (
        <div className="ml-6 mt-0.5 rounded-md bg-canvas px-3 py-2 text-xs text-ink/70">
          <p>
            <strong className="text-ink">Meaning:</strong> {word.meaningVi}
          </p>
          {word.meaningEn && (
            <p>
              <strong className="text-ink">English:</strong> {word.meaningEn}
            </p>
          )}
          {word.example && (
            <p className="mt-1 italic text-ink/50">"{word.example}"</p>
          )}
        </div>
      )}
    </div>
  );
}
