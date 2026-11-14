import { Checkbox } from "antd";
import type { WordFamilyWord } from "@/types/wordFamily";
import { CaretDownOutlined, CaretRightOutlined } from "@ant-design/icons";

interface ListViewProps {
  words: WordFamilyWord[];
  selectedIndices: Set<number>;
  expandedWords: Set<number>;
  onToggleSelect: (idx: number) => void;
  onToggleExpand: (idx: number) => void;
  onSelectAll: () => void;
  allSelected: boolean;
}

/**
 * List view with checkboxes for word selection and expandable details.
 */
export function ListView({
  words,
  selectedIndices,
  expandedWords,
  onToggleSelect,
  onToggleExpand,
  onSelectAll,
  allSelected,
}: ListViewProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface-card">
      {/* Select all header */}
      <div className="flex items-center gap-3 border-b border-hairline bg-surface-soft/60 px-4 py-2.5">
        <Checkbox checked={allSelected} onChange={onSelectAll} />
        <span className="text-xs font-medium text-ink/60">
          {selectedIndices.size}/{words.length} đã chọn
        </span>
      </div>

      {/* Word rows */}
      <div className="divide-y divide-hairline">
        {words.map((word, idx) => (
          <div key={idx} className="px-4 py-2.5">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selectedIndices.has(idx)}
                onChange={() => onToggleSelect(idx)}
              />
              <button
                type="button"
                onClick={() => onToggleExpand(idx)}
                className="flex flex-1 items-center gap-2.5 text-left text-[15px]"
              >
                {expandedWords.has(idx) ? (
                  <CaretDownOutlined className="text-ink/30" />
                ) : (
                  <CaretRightOutlined className="text-ink/30" />
                )}
                <span className="font-medium text-ink">{word.word}</span>
                {word.pos && (
                  <span className="rounded-pill bg-surface-cream-strong px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink/50">
                    {word.pos}
                  </span>
                )}
              </button>
            </div>

            {expandedWords.has(idx) && (
              <div className="ml-9 mt-1.5 space-y-2 rounded-md border border-hairline bg-canvas px-3.5 py-3 text-[13px] leading-relaxed">
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
        ))}
      </div>
    </div>
  );
}
