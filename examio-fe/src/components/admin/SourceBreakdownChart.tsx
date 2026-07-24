import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SourceBreakdownRow } from "@/apis/adminApi";
import { cn } from "@/lib/utils";

export interface SourceBreakdownChartProps {
  title: string;
  data: SourceBreakdownRow[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
  height?: number;
}

// Bảng màu xoay vòng cho các cột nguồn (CSS-var, đồng bộ light/dark).
const COLORS = [
  "var(--coral)",
  "#6c8ebf",
  "#5db872",
  "#d4a017",
  "#a97bd6",
  "#c64545",
];
const GRID = "var(--hairline)";
const AXIS_TEXT = "var(--muted-text)";
const numberFormatter = new Intl.NumberFormat("vi-VN");

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-md bg-hairline/60"
      style={{ height }}
      aria-hidden="true"
    />
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm text-ink/70">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-hairline bg-canvas px-3 py-1 text-xs font-medium text-ink hover:bg-surface-card"
        >
          Thử lại
        </button>
      ) : null}
    </div>
  );
}

export function SourceBreakdownChart({
  title,
  data,
  loading,
  error,
  onRetry,
  className,
  height = 320,
}: SourceBreakdownChartProps) {
  const hasData = Array.isArray(data) && data.length > 0;

  return (
    <div className={cn("rounded-lg bg-surface-card p-6", className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-normal tracking-tight text-ink">
          {title}
        </h3>
      </div>
      <div className="w-full" style={{ height }}>
        {loading ? (
          <ChartSkeleton height={height} />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : !hasData ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-ink/50">
            Chưa có dữ liệu
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                stroke={GRID}
                allowDecimals={false}
                tickFormatter={(v) => numberFormatter.format(Number(v))}
              />
              <YAxis
                type="category"
                dataKey="source"
                tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                stroke={GRID}
                width={96}
              />
              <Tooltip
                cursor={{ fill: "var(--hairline)", opacity: 0.3 }}
                contentStyle={{
                  backgroundColor: "var(--canvas)",
                  border: "1px solid var(--hairline)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--ink)",
                }}
                formatter={(value) => [
                  numberFormatter.format(Number(value)),
                  "Đăng ký",
                ]}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Đăng ký">
                {data.map((row, i) => (
                  <Cell key={row.source} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
