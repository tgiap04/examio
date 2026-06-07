import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminStore } from "@/stores/useAdminStore";
import { RangeSelector, type Range } from "@/components/admin/RangeSelector";
import { StatChart } from "@/components/admin/StatChart";
import type { SeriesPoint } from "@/apis/adminApi";

interface SeriesState {
  data: SeriesPoint[] | null;
  loading: boolean;
  error: string | null;
}

function selectSeries(name: string) {
  return (s: ReturnType<typeof useAdminStore.getState>): SeriesState => {
    const entry = s.series[name];
    if (!entry) {
      return { data: null, loading: false, error: null };
    }
    return {
      data: entry.data,
      loading: entry.loading,
      error: entry.error,
    };
  };
}

export default function AdminStatsPage() {
  const { t } = useTranslation("admin");
  const [range, setRange] = useState<Range>("30d");

  const signups = useAdminStore(selectSeries("signups"));
  const traffic = useAdminStore(selectSeries("traffic"));
  const revenue = useAdminStore(selectSeries("revenue"));

  useEffect(() => {
    void useAdminStore.getState().fetchSeries("signups", range, true);
    void useAdminStore.getState().fetchSeries("traffic", range, true);
    void useAdminStore.getState().fetchSeries("revenue", range, true);
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
          <h1 className="font-display text-3xl text-ink">
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
          data={signups.data ?? []}
          kind="line"
          loading={signups.loading}
          error={signups.error}
          onRetry={handleRetrySignups}
        />
        <StatChart
          title={t("stats.charts.traffic")}
          data={traffic.data ?? []}
          kind="area"
          loading={traffic.loading}
          error={traffic.error}
          onRetry={handleRetryTraffic}
        />
        <StatChart
          title={t("stats.charts.revenue")}
          data={revenue.data ?? []}
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
