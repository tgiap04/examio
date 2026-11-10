/**
 * Type definitions and date helpers for admin-stats module.
 * Pure functions — no NestJS or Prisma imports.
 */

export type SeriesName = 'signups' | 'traffic' | 'revenue';
export type SeriesRange = '7d' | '30d' | '90d';
export type SeriesBucket = 'day' | 'week' | 'month';

export interface OverviewResponse {
    totalUsers: number;
    activeToday: number;
    active30d: number;
    proCount: number;
    vipCount: number;
    revenue30d: number;
}

export interface SeriesPoint {
    date: string; // ISO date string (YYYY-MM-DD or full ISO)
    value: number;
}

export interface SeriesResponse {
    name: SeriesName;
    range: SeriesRange;
    bucket: SeriesBucket;
    points: SeriesPoint[];
}

/** Quy kết nguồn đăng ký theo utm_source (null → 'direct'). */
export interface SourceBreakdownRow {
    source: string;
    count: number;
}

export interface SourceBreakdownResponse {
    range: SeriesRange | 'all';
    rows: SourceBreakdownRow[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Returns the start of the current day in UTC (00:00:00.000). */
export function startOfToday(): Date {
    const now = new Date();
    return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
}

/** Returns the start of the day N days ago in UTC. */
export function startOfNDaysAgo(n: number): Date {
    const today = startOfToday();
    return new Date(today.getTime() - (n - 1) * MS_PER_DAY);
}

/** Maps range to number of days back. */
export function rangeToDays(range: SeriesRange): number {
    switch (range) {
        case '7d':
            return 7;
        case '30d':
            return 30;
        case '90d':
            return 90;
    }
}

/** Generates an array of UTC midnight dates from `start` to `end` inclusive. */
export function dateRangeArray(start: Date, end: Date): Date[] {
    const result: Date[] = [];
    const cursor = new Date(start.getTime());
    while (cursor.getTime() <= end.getTime()) {
        result.push(new Date(cursor.getTime()));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return result;
}

/**
 * Buckets raw `date_trunc` rows (which may be JS Date instances) and fills
 * missing days with value=0 to keep the series continuous.
 */
export function fillDateGaps(
    rows: { date: Date; value: number }[],
    start: Date,
    end: Date
): SeriesPoint[] {
    const map = new Map<string, number>();
    for (const row of rows) {
        const d =
            row.date instanceof Date
                ? row.date
                : new Date(row.date as unknown as string);
        const key = utcDateKey(d);
        map.set(key, (map.get(key) ?? 0) + Number(row.value ?? 0));
    }

    return dateRangeArray(start, end).map((d) => ({
        date: d.toISOString(),
        value: map.get(utcDateKey(d)) ?? 0,
    }));
}

/** Returns a YYYY-MM-DD string for a UTC date. */
function utcDateKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}
