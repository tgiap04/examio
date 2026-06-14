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
    <div className="rounded-lg border border-hairline bg-surface-card">
      {/* Select all header */}
      <div className="flex items-center gap-3 border-b border-hairline px-4 py-2">
        <Checkbox checked={allSelected} onChange={onSelectAll} />
        <span className="text-xs font-medium text-ink/60">
          {selectedIndices.size}/{words.length} đã chọn
        </span>
      </div>

      {/* Word rows */}
      <div className="divide-y divide-hairline">
        {words.map((word, idx) => (
          <div key={idx} className="px-4 py-2">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selectedIndices.has(idx)}
                onChange={() => onToggleSelect(idx)}
              />
              <button
                type="button"
                onClick={() => onToggleExpand(idx)}
                className="flex flex-1 items-center gap-2 text-left text-sm"
              >
                {expandedWords.has(idx) ? (
                  <CaretDownOutlined className="text-ink/40" />
                ) : (
                  <CaretRightOutlined className="text-ink/40" />
                )}
                <span className="font-medium text-ink">{word.word}</span>
                <span className="text-xs text-ink/40">{word.pos}</span>
              </button>
            </div>

            {expandedWords.has(idx) && (
              <div className="ml-9 mt-1 rounded-md bg-canvas px-3 py-2 text-xs text-ink/70">
                <p>
                  <strong className="text-ink">Nghĩa:</strong> {word.meaningVi}
                </p>
                {word.meaningEn && (
                  <p>
                    <strong className="text-ink">English:</strong>{" "}
                    {word.meaningEn}
                  </p>
                )}
                {word.example && (
                  <p className="mt-1 italic text-ink/50">"{word.example}"</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
