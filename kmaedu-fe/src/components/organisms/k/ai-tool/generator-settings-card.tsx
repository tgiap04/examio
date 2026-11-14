import { ChevronDown, ChevronUp, CircleHelp, FileText, Settings, Sparkle } from "lucide-react";
import { Switch } from "@/components/antd/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/antd/tooltip";
import { cn } from "@/lib/utils";
import { aiPanelClass } from "./ai-tool-ui";

const MIN_COUNT = 1;
const MAX_COUNT = 50;
const clampCount = (value: number) => Math.min(MAX_COUNT, Math.max(MIN_COUNT, value));

interface GeneratorSettingsCardProps {
  idPrefix: string;
  title: string;
  countLabel: string;
  count: number;
  onCountChange: (value: number) => void;
  isNarrow: boolean;
  onNarrowChange: (value: boolean) => void;
  narrowHint: string;
  keyword: string;
  onKeywordChange: (value: string) => void;
  disabled: boolean;
}

const rowClass = "flex min-h-[44px] items-center gap-3 text-[15px] text-body-strong [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0 [&>svg]:stroke-[1.75] [&>svg]:text-body";

/** Item count stepper and the keyword-focus toggle. */
export function GeneratorSettingsCard(props: GeneratorSettingsCardProps) {
  const { idPrefix, title, countLabel, count, onCountChange, isNarrow, onNarrowChange, narrowHint, keyword, onKeywordChange, disabled } = props;
  const countId = `${idPrefix}-count`;
  const narrowId = `${idPrefix}-narrow`;

  return (
    <section className={cn(aiPanelClass, "space-y-2 p-4 md:p-5")}>
      <h3 className={cn(rowClass, "min-h-0 pb-1 text-[16px] font-semibold text-ink")}>
        <Settings />
        {title}
      </h3>

      <div className={rowClass} data-tour="ai-tool-count">
        <FileText />
        <label htmlFor={countId} className="flex-1">{countLabel}</label>
        <div className="flex h-11 items-center rounded-full border border-hairline bg-canvas pl-4 pr-1.5 focus-within:border-brand">
          <input
            id={countId}
            type="number"
            inputMode="numeric"
            min={MIN_COUNT}
            max={MAX_COUNT}
            value={count}
            disabled={disabled}
            onChange={(event) => {
              const value = Number.parseInt(event.target.value, 10);
              if (!Number.isNaN(value)) onCountChange(clampCount(value));
            }}
            className="w-10 bg-transparent text-right text-[15px] font-semibold tabular-nums text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <div className="ml-2 flex flex-col">
            <button type="button" aria-label="Tăng" disabled={disabled || count >= MAX_COUNT} onClick={() => onCountChange(clampCount(count + 1))} className="grid h-4 w-6 place-items-center text-body hover:text-brand disabled:opacity-30">
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" aria-label="Giảm" disabled={disabled || count <= MIN_COUNT} onClick={() => onCountChange(clampCount(count - 1))} className="grid h-4 w-6 place-items-center text-body hover:text-brand disabled:opacity-30">
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className={rowClass} data-tour="ai-tool-advanced">
        <Sparkle />
        <label htmlFor={narrowId} className="flex flex-1 cursor-pointer items-center gap-2">
          Tập trung theo từ khóa
          <Tooltip>
            <TooltipTrigger asChild>
              <CircleHelp className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>{narrowHint}</TooltipContent>
          </Tooltip>
        </label>
        <Switch id={narrowId} checked={isNarrow} onCheckedChange={onNarrowChange} disabled={disabled} className="cursor-pointer data-[state=checked]:bg-brand" />
      </div>

      {isNarrow && (
        <input
          aria-label="Từ khóa"
          placeholder="Nhập từ khóa, ví dụ: quyền truy cập file"
          value={keyword}
          disabled={disabled}
          onChange={(event) => onKeywordChange(event.target.value)}
          className="h-11 w-full rounded-xl border border-hairline bg-surface-soft px-4 text-[14px] text-ink outline-none animate-in slide-in-from-top-2 duration-200 placeholder:text-muted-foreground focus:border-brand"
        />
      )}
    </section>
  );
}
