import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminStore } from "@/stores/useAdminStore";
import { RangeSelector, type Range } from "@/components/admin/RangeSelector";
import { StatChart } from "@/components/admin/StatChart";

// IMPORTANT: select the entry by its stable `s.series[name]` reference.
// `useSyncExternalStore` requires `getSnapshot` to return the SAME
// reference for unchanged state, otherwise React loops. A selector that
// builds a new object literal each call (e.g. `{ data, loading, error }`)
// breaks that contract and triggers "Maximum update depth exceeded".
const EMPTY_SERIES = {
  data: null,
  loading: false,
  error: null,
  lastFetched: null,
  lastQueryKey: null,
} as const;

export default function AdminStatsPage() {
  const { t } = useTranslation("admin");
  const [range, setRange] = useState<Range>("30d");

  // Series cache is keyed by `${name}:${range}` so different ranges live in
  // separate slots — switching between 7d/30d/90d never overwrites another.
  const signups = useAdminStore((s) => s.series[`signups:${range}`] ?? EMPTY_SERIES);
  const traffic = useAdminStore((s) => s.series[`traffic:${range}`] ?? EMPTY_SERIES);
  const revenue = useAdminStore((s) => s.series[`revenue:${range}`] ?? EMPTY_SERIES);

  useEffect(() => {
    // Without force, the cache (5-min TTL) skips the call when data
    // for this name+range was already fetched in this session.
    void useAdminStore.getState().fetchSeries("signups", range);
    void useAdminStore.getState().fetchSeries("traffic", range);
    void useAdminStore.getState().fetchSeries("revenue", range);
  }, [range]);

  const handleRetrySignups = () => {
    void useAdminStore.getState().fetchSeries("signups", range, true);
  };
  const handleRetryTraffic = () => {
    void useAdminStore.getState().fetchSeries("traffic", range, true);
  };
  const handleRetryRevenue = () => {
    void useAdminStore.getState().fetchSeries("revenue", range, true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-3xl font-normal tracking-tight text-ink">
            {t("pages.stats.title")}
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            {t("pages.stats.subtitle")}
          </p>
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="space-y-4">
        <StatChart
          title={t("stats.charts.signups")}
          data={signups.data?.points ?? []}
          kind="line"
          loading={signups.loading}
          error={signups.error}
          onRetry={handleRetrySignups}
        />
        <StatChart
          title={t("stats.charts.traffic")}
          data={traffic.data?.points ?? []}
          kind="area"
          loading={traffic.loading}
          error={traffic.error}
          onRetry={handleRetryTraffic}
        />
        <StatChart
          title={t("stats.charts.revenue")}
          data={revenue.data?.points ?? []}
          kind="bar"
          format="currency-vnd"
          loading={revenue.loading}
          error={revenue.error}
          onRetry={handleRetryRevenue}
        />
      </div>
    </div>
  );
}
