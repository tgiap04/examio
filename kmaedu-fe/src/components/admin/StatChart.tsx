import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "@/apis/adminApi";
import { cn } from "@/lib/utils";

export type StatChartKind = "line" | "area" | "bar";
export type StatChartFormat = "number" | "currency-vnd";

export interface StatChartProps {
  title: string;
  data: SeriesPoint[];
  kind: StatChartKind;
  format?: StatChartFormat;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
  height?: number;
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

function formatY(value: number, format: StatChartFormat): string {
  if (format === "currency-vnd") {
    if (value >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(1)} tỷ`;
    }
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)} tr`;
    }
    return vndFormatter.format(value);
  }
  return numberFormatter.format(value);
}

function formatTooltip(value: unknown, format: StatChartFormat): [string, string] {
  const n = typeof value === "number" ? value : Number(value);
  const num = Number.isFinite(n) ? n : 0;
  if (format === "currency-vnd") return [vndFormatter.format(num), "Giá trị"];
  return [numberFormatter.format(num), "Số lượng"];
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

export function StatChart({
  title,
  data,
  kind,
  format = "number",
  loading,
  error,
  onRetry,
  className,
  height = 320,
}: StatChartProps) {
  const hasData = Array.isArray(data) && data.length > 0;

  return (
    <div className={cn("rounded-lg bg-surface-card p-6", className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-normal tracking-tight text-ink">{title}</h3>
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
            {kind === "line" ? (
              <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXAxis}
                  tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                  stroke={GRID}
                />
                <YAxis
                  tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                  stroke={GRID}
                  width={56}
                  tickFormatter={(v) => formatY(Number(v), format)}
                  allowDecimals={false}
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
                  formatter={(value) => formatTooltip(value, format)}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: AXIS_TEXT }}
                  formatter={() => title}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={PRIMARY}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: PRIMARY }}
                  name={title}
                />
              </LineChart>
            ) : kind === "bar" ? (
              <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXAxis}
                  tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                  stroke={GRID}
                />
                <YAxis
                  tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                  stroke={GRID}
                  width={56}
                  tickFormatter={(v) => formatY(Number(v), format)}
                  allowDecimals={false}
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
                  formatter={(value) => formatTooltip(value, format)}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: AXIS_TEXT }}
                  formatter={() => title}
                />
                <Bar dataKey="value" fill={PRIMARY} radius={[4, 4, 0, 0]} name={title} />
              </BarChart>
            ) : (
              <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXAxis}
                  tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                  stroke={GRID}
                />
                <YAxis
                  tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                  stroke={GRID}
                  width={56}
                  tickFormatter={(v) => formatY(Number(v), format)}
                  allowDecimals={false}
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
                  formatter={(value) => formatTooltip(value, format)}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: AXIS_TEXT }}
                  formatter={() => title}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={PRIMARY}
                  strokeWidth={2}
                  fill={PRIMARY}
                  fillOpacity={0.25}
                  name={title}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
