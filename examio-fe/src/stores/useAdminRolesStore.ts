import { create } from "zustand";
import {
  getRoleMatrixApi,
  listRoleChangesApi,
  listRoleUsersApi,
  setRoleApi,
  setSystemAdminApi,
  type RoleChangesQuery,
  type RoleChangesResponse,
  type RoleMatrix,
  type RoleUser,
  type RoleUsersQuery,
  type RoleUsersResponse,
} from "@/apis/adminRolesApi";
import type { BaseRole, RoleChange } from "@/lib/admin-roles/role-change-rules";

interface Cached<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  key: string | null;
}

const FRESH_MS = 5 * 60 * 1000;
const MATRIX_FRESH_MS = 60 * 60 * 1000;

const empty = <T,>(): Cached<T> => ({ data: null, loading: false, error: null, fetchedAt: null, key: null });
const fresh = (c: Cached<unknown>, key: string | null, ttl: number) =>
  c.data !== null && c.fetchedAt !== null && Date.now() - c.fetchedAt < ttl && c.key === key;

interface AdminRolesState {
  users: Cached<RoleUsersResponse>;
  changes: Cached<RoleChangesResponse>;
  matrix: Cached<RoleMatrix>;
  fetchUsers: (query: RoleUsersQuery, force?: boolean) => Promise<void>;
  fetchChanges: (query: RoleChangesQuery, force?: boolean) => Promise<void>;
  fetchMatrix: (force?: boolean) => Promise<void>;
  /** Applies a confirmed change, then drops both caches so the next read refetches. */
  applyChange: (user: RoleUser, change: RoleChange, reason: string) => Promise<RoleUser>;
  invalidate: () => void;
}

/** Cache per query (5 min, same query only); every create/update invalidates it. */
function loader<K extends "users" | "changes", Q, R>(
  name: K,
  call: (query: Q) => Promise<R>,
  get: () => AdminRolesState,
  set: (partial: Partial<AdminRolesState>) => void,
) {
  return async (query: Q, force?: boolean) => {
    const current = get()[name] as unknown as Cached<R>;
    const key = JSON.stringify(query);
    if (!force && fresh(current, key, FRESH_MS)) return;
    set({ [name]: { ...current, loading: true, error: null, key } } as Partial<AdminRolesState>);
    try {
      const data = await call(query);
      // A newer query may have started meanwhile: keep only the latest answer.
      if ((get()[name] as unknown as Cached<R>).key !== key) return;
      set({ [name]: { data, loading: false, error: null, fetchedAt: Date.now(), key } } as Partial<AdminRolesState>);
    } catch (error) {
      if ((get()[name] as unknown as Cached<R>).key !== key) return;
      set({
        [name]: { ...current, loading: false, error: (error as Error).message, key },
      } as Partial<AdminRolesState>);
    }
  };
}

export const useAdminRolesStore = create<AdminRolesState>((set, get) => ({
  users: empty(),
  changes: empty(),
  matrix: empty(),

  fetchUsers: loader("users", listRoleUsersApi, get, set),
  fetchChanges: loader("changes", listRoleChangesApi, get, set),

  fetchMatrix: async (force) => {
    const current = get().matrix;
    if (!force && fresh(current, "matrix", MATRIX_FRESH_MS)) return;
    set({ matrix: { ...current, loading: true, error: null } });
    try {
      const data = await getRoleMatrixApi();
      set({ matrix: { data, loading: false, error: null, fetchedAt: Date.now(), key: "matrix" } });
    } catch (error) {
      set({ matrix: { ...current, loading: false, error: (error as Error).message } });
    }
  },

  applyChange: async (user, change, reason) => {
    const body = reason.trim() ? { reason: reason.trim() } : {};
    const result =
      change.kind === "role"
        ? await setRoleApi(user.id, { role: change.to as BaseRole, ...body })
        : await setSystemAdminApi(user.id, { isSystemAdmin: change.grant, ...body });
    get().invalidate();
    return result.user;
  },

  invalidate: () =>
    set({
      users: { ...get().users, data: null, fetchedAt: null, key: null },
      changes: { ...get().changes, data: null, fetchedAt: null, key: null },
    }),
}));
