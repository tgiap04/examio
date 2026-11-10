import type { WordFamilyWord } from "@/types/wordFamily";
import { WordFamilyNode } from "./WordFamilyNode";
import { posMeta, POS_ORDER, type PosMeta } from "./pos-meta";
import "./word-family-tree.css";

interface TreeViewProps {
  rootWord: string;
  words: WordFamilyWord[];
}

/** Root node card (top of the chart). */
function RootNode({ rootWord, total }: { rootWord: string; total: number }) {
  return (
    <div className="wft-node">
      <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-canvas px-4 py-3 shadow-sm">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-coral text-base font-semibold text-white ring-4 ring-coral/15">
          {rootWord.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 pr-1">
          <p className="truncate font-display text-lg font-semibold tracking-tight text-ink">
            {rootWord}
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-ink/40">
            Từ gốc
          </p>
        </div>
      </div>
      {total > 0 && <span className="wft-badge">{total}</span>}
    </div>
  );
}

/** Part-of-speech branch node. */
function PosNode({ meta, count }: { meta: PosMeta; count: number }) {
  return (
    <div className="wft-node">
      <div
        className="flex items-center gap-2 rounded-xl border bg-canvas px-3.5 py-2 shadow-sm"
        style={{ borderColor: `${meta.color}55` }}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: meta.color }}
        />
        <span className="font-display text-sm font-semibold text-ink">
          {meta.label}
        </span>
      </div>
      <span className="wft-badge">{count}</span>
    </div>
  );
}

/**
 * Org-chart style tree: root word → part-of-speech branches → word cards,
 * connected with orthogonal elbow connectors on a dotted canvas.
 */
export function TreeView({ rootWord, words }: TreeViewProps) {
  const posGroups = words.reduce<
    Record<string, { word: WordFamilyWord; idx: number }[]>
  >((acc, word, idx) => {
    const key = (word.pos || "other").toLowerCase().trim();
    (acc[key] ??= []).push({ word, idx });
    return acc;
  }, {});

  const orderedPos = Object.keys(posGroups).sort((a, b) => {
    const ia = POS_ORDER.indexOf(a);
    const ib = POS_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  return (
    <div className="wft rounded-2xl border border-hairline">
      <p className="wft-title">
        Tổng: <b>{words.length}</b> từ vựng
      </p>

      <ul>
        <li>
          <RootNode rootWord={rootWord} total={words.length} />

          <ul>
            {orderedPos.map((pos) => {
              const meta = posMeta(pos);
              const items = posGroups[pos];
              return (
                <li key={pos}>
                  <PosNode meta={meta} count={items.length} />

                  <ul>
                    {items.map(({ word, idx }) => (
                      <li key={idx}>
                        <WordFamilyNode word={word} accent={meta.color} />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </li>
      </ul>
    </div>
  );
}
