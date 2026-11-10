import { api } from "@/apis/api";
import { toApiFailure } from "@/lib/quiz-practice/api-failure";
import type { BaseRole } from "@/lib/admin-roles/role-change-rules";

export interface RoleUser {
  id: string;
  email: string;
  username: string;
  name: string;
  avatar: string | null;
  role: BaseRole;
  isSystemAdmin: boolean;
  isBanned: boolean;
  isVerified: boolean;
  createdAt: string;
}

export interface RoleChangeEntry {
  id: string;
  targetUserId: string;
  targetEmail: string;
  actorUserId: string | null;
  actorEmail: string;
  fromRole: BaseRole;
  toRole: BaseRole;
  fromAdmin: boolean;
  toAdmin: boolean;
  reason: string | null;
  source: "admin-ui" | "cli" | "bootstrap" | string;
  createdAt: string;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
}

export interface RoleUsersResponse {
  data: RoleUser[];
  meta: PageMeta;
  systemAdminCount: number;
}

export interface RoleChangesResponse {
  data: RoleChangeEntry[];
  meta: PageMeta;
}

export interface RoleMatrix {
  roles: Array<{ key: "STUDENT" | "TEACHER" | "SYSTEM_ADMIN"; permissions: string[] }>;
  permissions: string[];
}

export interface RoleUsersQuery {
  q?: string;
  role?: BaseRole;
  isSystemAdmin?: boolean;
  page?: number;
  limit?: number;
}

export interface RoleChangesQuery {
  userId?: string;
  page?: number;
  limit?: number;
}

/**
 * Mutations accept every 4xx except 401 (token refresh stays with the shared
 * interceptor) so the API `code` (CANNOT_CHANGE_OWN_ROLE, LAST_SYSTEM_ADMIN...)
 * reaches the UI as an `ApiFailure` instead of a bare Error(message).
 */
export const acceptRoleStatuses = (status: number): boolean =>
  (status >= 200 && status < 300) || (status >= 400 && status < 500 && status !== 401);

async function mutate<T>(url: string, body: unknown): Promise<T> {
  const response = await api.put<T>(url, body, { validateStatus: acceptRoleStatuses });
  if (response.status >= 200 && response.status < 300) return response.data;
  throw toApiFailure(response.status, response.data);
}

export async function getRoleMatrixApi(): Promise<RoleMatrix> {
  return (await api.get("/admin/roles")).data;
}

export async function listRoleUsersApi(query: RoleUsersQuery): Promise<RoleUsersResponse> {
  return (await api.get("/admin/roles/users", { params: query })).data;
}

export async function listRoleChangesApi(query: RoleChangesQuery): Promise<RoleChangesResponse> {
  return (await api.get("/admin/roles/changes", { params: query })).data;
}

export function setRoleApi(id: string, body: { role: BaseRole; reason?: string }) {
  return mutate<{ user: RoleUser }>(`/admin/roles/users/${encodeURIComponent(id)}/role`, body);
}

export function setSystemAdminApi(id: string, body: { isSystemAdmin: boolean; reason?: string }) {
  return mutate<{ user: RoleUser }>(`/admin/roles/users/${encodeURIComponent(id)}/system-admin`, body);
}
