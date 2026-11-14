import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "@/apis/adminApi";
import { cn } from "@/lib/utils";

export type MiniChartKind = "line" | "area" | "bar";
export type MiniChartFormat = "number" | "currency-vnd";

export interface MiniChartCardProps {
  title: string;
  data: SeriesPoint[];
  kind: MiniChartKind;
  format?: MiniChartFormat;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
  /** Optional axis label (Vietnamese) */
  axisLabel?: string;
  /** Whether to render the X axis labels */
  showAxis?: boolean;
}

const PRIMARY = "var(--coral)";
const GRID = "var(--hairline)";
const AXIS_TEXT = "var(--muted-text)";

const vndFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("vi-VN");

function formatXAxis(date: string): string {
  // Handle both "YYYY-MM-DD" and full ISO datetime "YYYY-MM-DDTHH:MM:SS.sssZ"
  const datePart = date.split("T")[0];
  const parts = datePart.split("-");
  if (parts.length !== 3) return date;
  return `${parts[2]}/${parts[1]}`;
}

function formatY(value: number, format: MiniChartFormat): string {
  if (format === "currency-vnd") {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} tỷ`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} tr`;
    return vndFormatter.format(value);
  }
  return numberFormatter.format(value);
}

function formatTooltipValue(value: number, format: MiniChartFormat): string {
  if (format === "currency-vnd") return vndFormatter.format(value);
  return numberFormatter.format(value);
}

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

export function MiniChartCard({
  title,
  data,
  kind,
  format = "number",
  loading,
  error,
  onRetry,
  className,
  showAxis = true,
}: MiniChartCardProps) {
  const hasData = Array.isArray(data) && data.length > 0;

  return (
    <div className={cn("rounded-lg bg-surface-card p-6", className)}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
      </div>
      <div className="h-[200px] w-full">
        {loading ? (
          <ChartSkeleton height={200} />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : !hasData ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-ink/50">
            Chưa có dữ liệu
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {kind === "line" ? (
              <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: showAxis ? 16 : 0 }}>
                {showAxis ? (
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                ) : null}
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXAxis}
                  tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                  stroke={GRID}
                  hide={!showAxis}
                />
                <YAxis
                  tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                  stroke={GRID}
                  width={32}
                  allowDecimals={false}
                  tickFormatter={(v) => formatY(Number(v), format)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--canvas)",
                    border: "1px solid var(--hairline)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--ink)",
                  }}
                  labelFormatter={(label) => formatXAxis(String(label))}
                  formatter={(value) => [formatTooltipValue(Number(value), format), title]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={PRIMARY}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: PRIMARY }}
                />
              </LineChart>
            ) : kind === "bar" ? (
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: showAxis ? 16 : 0 }}>
                {showAxis ? (
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                ) : null}
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXAxis}
                  tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                  stroke={GRID}
                  hide={!showAxis}
                />
                <YAxis
                  tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                  stroke={GRID}
                  width={36}
                  allowDecimals={false}
                  tickFormatter={(v) => formatY(Number(v), format)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--canvas)",
                    border: "1px solid var(--hairline)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--ink)",
                  }}
                  labelFormatter={(label) => formatXAxis(String(label))}
                  formatter={(value) => [formatTooltipValue(Number(value), format), title]}
                />
                <Bar dataKey="value" fill={PRIMARY} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: showAxis ? 16 : 0 }}>
                {showAxis ? (
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                ) : null}
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXAxis}
                  tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                  stroke={GRID}
                  hide={!showAxis}
                />
                <YAxis
                  tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                  stroke={GRID}
                  width={36}
                  allowDecimals={false}
                  tickFormatter={(v) => formatY(Number(v), format)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--canvas)",
                    border: "1px solid var(--hairline)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--ink)",
                  }}
                  labelFormatter={(label) => formatXAxis(String(label))}
                  formatter={(value) => [formatTooltipValue(Number(value), format), title]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={PRIMARY}
                  strokeWidth={2}
                  fill={PRIMARY}
                  fillOpacity={0.25}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
