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
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[15px] transition-colors duration-150 hover:bg-canvas"
      >
        {expanded ? (
          <CaretDownOutlined className="text-ink/30" />
        ) : (
          <CaretRightOutlined className="text-ink/30" />
        )}
        {renderHighlightedWord()}
      </button>

      {expanded && (
        <div className="ml-6 mt-1 space-y-2 rounded-md border border-hairline bg-canvas px-3.5 py-3 text-[13px] leading-relaxed">
          <p className="flex gap-2">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink/40">
              Nghĩa
            </span>
            <span className="text-ink/80">{word.meaningVi}</span>
          </p>
          {word.meaningEn && (
            <p className="flex gap-2">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink/40">
                EN
              </span>
              <span className="text-ink/70">{word.meaningEn}</span>
            </p>
          )}
          {word.example && (
            <p className="border-l-2 border-coral/30 pl-2.5 italic text-ink/55">
              "{word.example}"
            </p>
          )}
        </div>
      )}
    </div>
  );
}
