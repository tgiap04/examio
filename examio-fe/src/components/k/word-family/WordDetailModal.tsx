import { Modal } from "antd";
import type { WordFamilyWord } from "@/types/wordFamily";
import { HighlightedWord } from "./HighlightedWord";
import { posMeta } from "./pos-meta";

interface WordDetailModalProps {
  open: boolean;
  word: WordFamilyWord;
  /** Branch accent color (from the POS group). */
  accent: string;
  onClose: () => void;
}

/**
 * Modal showing the full detail of a single word: highlighted form, POS,
 * affix breakdown, meanings (VI/EN) and an example sentence.
 */
export function WordDetailModal({
  open,
  word,
  accent,
  onClose,
}: WordDetailModalProps) {
  const meta = posMeta(word.pos);
  const { affix } = word;

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={460} centered>
      <div className="space-y-4 pt-1">
        {/* Header: word + POS badge */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold"
            style={{ backgroundColor: `${accent}1f`, color: accent }}
          >
            {word.word.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-2xl leading-tight">
              <HighlightedWord word={word} size="lg" />
            </div>
            <span
              className="mt-1 inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[12px] font-medium"
              style={{ backgroundColor: `${accent}14`, color: accent }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: accent }}
              />
              {meta.label}
            </span>
          </div>
        </div>

        {/* Affix breakdown */}
        {affix && (affix.prefix || affix.suffix) && (
          <div className="flex flex-wrap gap-1.5 text-[12px]">
            {affix.prefix && (
              <span className="rounded-md bg-surface-soft px-2 py-1 text-ink/70">
                Tiền tố: <b className="text-coral">{affix.prefix}</b>
              </span>
            )}
            <span className="rounded-md bg-surface-soft px-2 py-1 text-ink/70">
              Gốc: <b className="text-ink">{affix.root}</b>
            </span>
            {affix.suffix && (
              <span className="rounded-md bg-surface-soft px-2 py-1 text-ink/70">
                Hậu tố: <b className="text-coral">{affix.suffix}</b>
              </span>
            )}
          </div>
        )}

        {/* Meanings */}
        <div className="space-y-3 rounded-xl border border-hairline bg-canvas px-4 py-3 text-[14px] leading-relaxed">
          <div className="flex gap-3">
            <span className="mt-0.5 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink/40">
              Nghĩa
            </span>
            <span className="font-medium text-ink/85">{word.meaningVi}</span>
          </div>
          {word.meaningEn && (
            <div className="flex gap-3">
              <span className="mt-0.5 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink/40">
                EN
              </span>
              <span className="text-ink/70">{word.meaningEn}</span>
            </div>
          )}
        </div>

        {/* Example */}
        {word.example && (
          <div
            className="rounded-xl border-l-2 bg-surface-soft/50 px-4 py-3 text-[14px] italic leading-relaxed text-ink/70"
            style={{ borderColor: accent }}
          >
            &ldquo;{word.example}&rdquo;
          </div>
        )}
      </div>
    </Modal>
  );
}
