import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAdminStore } from "@/stores/useAdminStore";
import { KpiCard } from "@/components/admin/KpiCard";
import { MiniChartCard } from "@/components/admin/MiniChartCard";

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
} as const;

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-surface-card p-8 text-center">
      <p className="text-sm text-ink/70">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-hairline bg-canvas px-4 py-1.5 text-sm font-medium text-ink hover:bg-surface-cream-strong"
      >
        Thử lại
      </button>
    </div>
  );
}

export default function AdminOverviewPage() {
  const { t } = useTranslation("admin");

  const overview = useAdminStore((s) => s.overview);
  const signups = useAdminStore((s) => s.series.signups ?? EMPTY_SERIES);
  const traffic = useAdminStore((s) => s.series.traffic ?? EMPTY_SERIES);
  const revenue = useAdminStore((s) => s.series.revenue ?? EMPTY_SERIES);

  useEffect(() => {
    void useAdminStore.getState().fetchOverview();
    void useAdminStore.getState().fetchSeries("signups", "7d");
    void useAdminStore.getState().fetchSeries("traffic", "7d");
    void useAdminStore.getState().fetchSeries("revenue", "7d");
  }, []);

  const handleRetryOverview = () => {
    void useAdminStore.getState().fetchOverview(true);
  };
  const handleRetrySignups = () => {
    void useAdminStore.getState().fetchSeries("signups", "7d", true);
  };
  const handleRetryTraffic = () => {
    void useAdminStore.getState().fetchSeries("traffic", "7d", true);
  };
  const handleRetryRevenue = () => {
    void useAdminStore.getState().fetchSeries("revenue", "7d", true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-normal tracking-tight text-ink">
          {t("pages.overview.title")}
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          {t("pages.overview.subtitle")}
        </p>
      </div>

      {overview.error && !overview.loading ? (
        <ErrorBlock message={overview.error} onRetry={handleRetryOverview} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label={t("kpi.totalUsers")}
            value={overview.data?.totalUsers ?? null}
            loading={overview.loading}
          />
          <KpiCard
            label={t("kpi.activeToday")}
            value={overview.data?.activeUsers ?? null}
            loading={overview.loading}
          />
          <KpiCard
            label={t("kpi.proCount")}
            value={overview.data?.totalRevenue ?? null}
            loading={overview.loading}
          />
          <KpiCard
            label={t("kpi.vipCount")}
            value={overview.data?.pendingPayments ?? null}
            loading={overview.loading}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <MiniChartCard
          title={t("overview.charts.signups7d")}
          data={signups.data ?? []}
          kind="line"
          loading={signups.loading}
          error={signups.error}
          onRetry={handleRetrySignups}
        />
        <MiniChartCard
          title={t("overview.charts.traffic7d")}
          data={traffic.data ?? []}
          kind="area"
          loading={traffic.loading}
          error={traffic.error}
          onRetry={handleRetryTraffic}
        />
        <MiniChartCard
          title={t("overview.charts.revenue30d")}
          data={revenue.data ?? []}
          kind="bar"
          loading={revenue.loading}
          error={revenue.error}
          onRetry={handleRetryRevenue}
        />
      </div>
    </div>
  );
}
