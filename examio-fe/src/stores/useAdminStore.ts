import { create } from "zustand";
import {
  getOverviewApi,
  getSeriesApi,
  listAuditApi,
  listUsersApi,
  OverviewKpi,
  SeriesPoint,
  type ListAuditQuery,
  type ListUsersQuery,
  type AuditRow,
  type UserRow,
} from "@/apis/adminApi";

interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
}

const FRESH_MS = 5 * 60 * 1000;

function isFresh(timestamp: number | null) {
  if (!timestamp) return false;
  return Date.now() - timestamp < FRESH_MS;
}

interface AdminState {
  overview: ResourceState<OverviewKpi>;
  series: Record<string, ResourceState<SeriesPoint[]>>;
  users: ResourceState<{
    data: UserRow[];
    total: number;
    page: number;
    size: number;
  }>;
  audit: ResourceState<{
    data: AuditRow[];
    total: number;
    page: number;
    size: number;
  }>;
  fetchOverview: (force?: boolean) => Promise<void>;
  fetchSeries: (
    name: string,
    range: "7d" | "30d" | "90d",
    force?: boolean,
  ) => Promise<void>;
  fetchUsers: (query: ListUsersQuery, force?: boolean) => Promise<void>;
  fetchAudit: (query: ListAuditQuery, force?: boolean) => Promise<void>;
  invalidateOverview: () => void;
  invalidateSeries: (name?: string) => void;
  invalidateUsers: () => void;
  invalidateAudit: () => void;
}

const empty = <T,>(): ResourceState<T> => ({
  data: null,
  loading: false,
  error: null,
  lastFetched: null,
});

export const useAdminStore = create<AdminState>((set, get) => ({
  overview: empty<OverviewKpi>(),
  series: {},
  users: empty(),
  audit: empty(),

  fetchOverview: async (force) => {
    const current = get().overview;
    if (!force && current.data && isFresh(current.lastFetched)) return;
    if (current.loading) return;

    set((s) => ({ overview: { ...s.overview, loading: true, error: null } }));
    try {
      const data = await getOverviewApi();
      set((s) => ({
        overview: {
          data,
          loading: false,
          error: null,
          lastFetched: Date.now(),
        },
      }));
    } catch (error) {
      set((s) => ({
        overview: {
          ...s.overview,
          loading: false,
          error: (error as Error).message,
        },
      }));
    }
  },

  fetchSeries: async (name, range, force) => {
    const current = get().series[name] ?? empty<SeriesPoint[]>();
    if (!force && current.data && isFresh(current.lastFetched)) return;
    if (current.loading) return;

    set((s) => ({
      series: {
        ...s.series,
        [name]: { ...current, loading: true, error: null },
      },
    }));
    try {
      const data = await getSeriesApi(name, range);
      set((s) => ({
        series: {
          ...s.series,
          [name]: { data, loading: false, error: null, lastFetched: Date.now() },
        },
      }));
    } catch (error) {
      set((s) => ({
        series: {
          ...s.series,
          [name]: {
            ...current,
            loading: false,
            error: (error as Error).message,
          },
        },
      }));
    }
  },

  fetchUsers: async (query, force) => {
    const current = get().users;
    if (!force && current.data && isFresh(current.lastFetched)) return;
    if (current.loading) return;

    set((s) => ({ users: { ...s.users, loading: true, error: null } }));
    try {
      const data = await listUsersApi(query);
      set((s) => ({
        users: {
          data,
          loading: false,
          error: null,
          lastFetched: Date.now(),
        },
      }));
    } catch (error) {
      set((s) => ({
        users: {
          ...s.users,
          loading: false,
          error: (error as Error).message,
        },
      }));
    }
  },

  fetchAudit: async (query, force) => {
    const current = get().audit;
    if (!force && current.data && isFresh(current.lastFetched)) return;
    if (current.loading) return;

    set((s) => ({ audit: { ...s.audit, loading: true, error: null } }));
    try {
      const data = await listAuditApi(query);
      set((s) => ({
        audit: {
          data,
          loading: false,
          error: null,
          lastFetched: Date.now(),
        },
      }));
    } catch (error) {
      set((s) => ({
        audit: {
          ...s.audit,
          loading: false,
          error: (error as Error).message,
        },
      }));
    }
  },

  invalidateOverview: () =>
    set((s) => ({ overview: { ...s.overview, data: null, lastFetched: null } })),
  invalidateSeries: (name) =>
    set((s) => {
      if (!name) return { series: {} };
      const next = { ...s.series };
      delete next[name];
      return { series: next };
    }),
  invalidateUsers: () =>
    set((s) => ({ users: { ...s.users, data: null, lastFetched: null } })),
  invalidateAudit: () =>
    set((s) => ({ audit: { ...s.audit, data: null, lastFetched: null } })),
}));
