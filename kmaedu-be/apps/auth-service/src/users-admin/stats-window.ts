const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Start of the current UTC day. */
export function startOfToday(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Start of the UTC day `n - 1` days ago: a window of `n` calendar days including today. */
export function startOfNDaysAgo(n: number): Date {
    return new Date(startOfToday().getTime() - (n - 1) * MS_PER_DAY);
}

export const DEFAULT_STATS_DAYS = 30;
export const MAX_STATS_DAYS = 365;

/** 0 = default; anything outside 1..365 is the caller's error. */
export function resolveDays(days: number | undefined): number | null {
    const d = !days ? DEFAULT_STATS_DAYS : days;
    return Number.isInteger(d) && d >= 1 && d <= MAX_STATS_DAYS ? d : null;
}

export const dayKey = (d: Date): string => d.toISOString().slice(0, 10);
