import { create } from "zustand";
import {
  getOverviewApi,
  getSeriesApi,
  getSourcesApi,
  listAuditApi,
  listUsersApi,
  OverviewKpi,
  SeriesPoint,
  type ListAuditQuery,
  type ListUsersQuery,
  type AuditRow,
  type UserRow,
  type SourceBreakdownResponse,
} from "@/apis/adminApi";

interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
  /** JSON-hash of the query used for the cached data — cache only
   *  returns fresh when the same query is reused within the TTL. */
  lastQueryKey: string | null;
}

const FRESH_MS = 5 * 60 * 1000;

function isFresh(timestamp: number | null) {
  if (!timestamp) return false;
  return Date.now() - timestamp < FRESH_MS;
}

/** Standard page envelope returned by paginated admin endpoints. */
interface PageEnvelope<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Full shape returned by the series API — the UI extracts `.points`. */
interface SeriesResponse {
  name: string;
  range: string;
  bucket: string;
  points: SeriesPoint[];
}

/** Cached list of admin users for filter dropdowns (e.g. audit page). */
const ADMIN_LIST_CACHE_MS = 10 * 60 * 1000;

interface AdminState {
  overview: ResourceState<OverviewKpi>;
  series: Record<string, ResourceState<SeriesResponse>>;
  /** Signup-source breakdown, keyed by range ('all' | '7d' | '30d' | '90d'). */
  sources: Record<string, ResourceState<SourceBreakdownResponse>>;
  users: ResourceState<PageEnvelope<UserRow>>;
  audit: ResourceState<PageEnvelope<AuditRow>>;
  /** Cached list of admin users for filter dropdowns. */
  adminList: { data: UserRow[]; cachedAt: number } | null;
  /** Monotonic counters bumped by invalidate*() — components include
   *  these in useEffect deps so that CUD actions trigger a re-fetch. */
  usersVersion: number;
  auditVersion: number;
  fetchOverview: (force?: boolean) => Promise<void>;
  fetchSeries: (
    name: string,
    range: "7d" | "30d" | "90d",
    force?: boolean,
  ) => Promise<void>;
  fetchSources: (range?: "7d" | "30d" | "90d", force?: boolean) => Promise<void>;
  fetchUsers: (query: ListUsersQuery, force?: boolean) => Promise<void>;
  fetchAudit: (query: ListAuditQuery, force?: boolean) => Promise<void>;
  /** Fetch admin list for filter dropdowns with built-in caching. */
  fetchAdminList: () => Promise<UserRow[]>;
  invalidateOverview: () => void;
  invalidateSeries: (name?: string) => void;
  invalidateSources: () => void;
  invalidateUsers: () => void;
  invalidateAudit: () => void;
  /** Drops the cached admin list (an admin was granted/revoked/banned elsewhere). */
  invalidateAdminList: () => void;
}

const empty = <T,>(): ResourceState<T> => ({
  data: null,
  loading: false,
  error: null,
  lastFetched: null,
  lastQueryKey: null,
});

function queryKey(query: unknown): string {
  return JSON.stringify(query);
}

export const useAdminStore = create<AdminState>((set, get) => ({
  overview: empty<OverviewKpi>(),
  series: {},
  sources: {},
  users: empty(),
  audit: empty(),
  adminList: null,
  usersVersion: 0,
  auditVersion: 0,

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
          lastQueryKey: null,
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
    const compoundKey = `${name}:${range}`;
    const current = get().series[compoundKey] ?? empty<SeriesResponse>();
    // compoundKey (name:range) IS the cache key — different ranges live in
    // separate slots and never overwrite each other.
    if (!force && current.data && isFresh(current.lastFetched)) return;
    if (current.loading) return;

    set((s) => ({
      series: {
        ...s.series,
        [compoundKey]: { ...current, loading: true, error: null },
      },
    }));
    try {
      const data = await getSeriesApi(name, range);
      set((s) => ({
        series: {
          ...s.series,
          [compoundKey]: { data, loading: false, error: null, lastFetched: Date.now(), lastQueryKey: null },
        },
      }));
    } catch (error) {
      set((s) => ({
        series: {
          ...s.series,
          [compoundKey]: {
            ...current,
            loading: false,
            error: (error as Error).message,
          },
        },
      }));
    }
  },

  fetchSources: async (range, force) => {
    const key = range ?? "all";
    const current = get().sources[key] ?? empty<SourceBreakdownResponse>();
    if (!force && current.data && isFresh(current.lastFetched)) return;
    if (current.loading) return;

    set((s) => ({
      sources: {
        ...s.sources,
        [key]: { ...current, loading: true, error: null },
      },
    }));
    try {
      const data = await getSourcesApi(range);
      set((s) => ({
        sources: {
          ...s.sources,
          [key]: {
            data,
            loading: false,
            error: null,
            lastFetched: Date.now(),
            lastQueryKey: null,
          },
        },
      }));
    } catch (error) {
      set((s) => ({
        sources: {
          ...s.sources,
          [key]: {
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
    const key = queryKey(query);
    // Only use cache when query params match
    if (!force && current.data && isFresh(current.lastFetched) && current.lastQueryKey === key) return;
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
          lastQueryKey: key,
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
    const key = queryKey(query);
    // Only use cache when query params match
    if (!force && current.data && isFresh(current.lastFetched) && current.lastQueryKey === key) return;
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
          lastQueryKey: key,
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

  fetchAdminList: async () => {
    const cached = get().adminList;
    if (cached && Date.now() - cached.cachedAt < ADMIN_LIST_CACHE_MS) {
      return cached.data;
    }
    const res = await listUsersApi({ isSystemAdmin: true, pageSize: 100 });
    const list: UserRow[] = res?.rows ?? [];
    set({ adminList: { data: list, cachedAt: Date.now() } });
    return list;
  },

  invalidateOverview: () =>
    set((s) => ({ overview: { ...s.overview, data: null, lastFetched: null } })),
  invalidateSeries: (name) =>
    set((s) => {
      if (!name) return { series: {} };
      const next = { ...s.series };
      // Remove all entries that match this series name at any range
      // (compound keys look like "signups:7d", "signups:30d", …).
      Object.keys(next).forEach((key) => {
        if (key === name || key.startsWith(`${name}:`)) {
          delete next[key];
        }
      });
      return { series: next };
    }),
  invalidateSources: () => set(() => ({ sources: {} })),
  invalidateUsers: () =>
    set((s) => ({
      users: { ...s.users, data: null, lastFetched: null, lastQueryKey: null },
      usersVersion: s.usersVersion + 1,
    })),
  invalidateAdminList: () => set({ adminList: null }),
  invalidateAudit: () =>
    set((s) => ({
      audit: { ...s.audit, data: null, lastFetched: null, lastQueryKey: null },
      auditVersion: s.auditVersion + 1,
    })),
}));
