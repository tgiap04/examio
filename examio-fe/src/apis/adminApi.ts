import { api } from "@/apis/api";

import { env } from "@/lib/env";
import { unwrap } from "@/lib/quiz-practice/api-failure";
import { acceptRoleStatuses } from "@/apis/adminRolesApi";

// ==================== Types ====================

export interface UserRow {
  /** Backend ids are cuid strings. */
  id: string;
  email: string;
  username: string;
  name: string;
  avatar: string;
  role: "STUDENT" | "TEACHER";
  isSystemAdmin: boolean;
  isBanned: boolean;
  isVerified: boolean;
  createdAt: string;
}

export interface AuditRow {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface OverviewKpi {
  totalUsers: number;
  activeToday: number;
  active30d: number;
}

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface SeriesResponse {
  name: string;
  range: string;
  bucket: string;
  points: SeriesPoint[];
}

export interface SourceBreakdownRow {
  source: string;
  count: number;
}

export interface SourceBreakdownResponse {
  range: string;
  rows: SourceBreakdownRow[];
}

export interface ListUsersQuery {
  search?: string;
  isSystemAdmin?: boolean;
  isBanned?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ListAuditQuery {
  adminId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface UpdateUserBody {
  name?: string;
  bio?: string;
  isVerified?: boolean;
}

export interface LogTicketResponse {
  ticket: string;
  expiresIn: number;
}

export interface RecentLogLine {
  service: string;
  line: string;
  ts: string;
}

// ==================== API Functions ====================

export async function listUsersApi(query: ListUsersQuery = {}) {
  const response = await api.get("/admin/users", { params: query });
  return response.data;
}

export async function getUserApi(id: string) {
  const response = await api.get(`/admin/users/${id}`);
  return response.data;
}

export async function updateUserApi(id: string, body: UpdateUserBody) {
  const response = await api.patch(`/admin/users/${id}`, body);
  return response.data;
}

/**
 * Ban / unban accept every 4xx except 401 so the API `code` (LAST_SYSTEM_ADMIN,
 * CANNOT_CHANGE_OWN_STATUS) reaches the UI as an `ApiFailure` (the shared
 * interceptor would reduce it to a bare Error(message)).
 */
async function postStatus(path: string) {
  const response = await api.post(path, undefined, { validateStatus: acceptRoleStatuses });
  return unwrap(response);
}

export function banUserApi(id: string) {
  return postStatus(`/admin/users/${encodeURIComponent(id)}/ban`);
}

export function unbanUserApi(id: string) {
  return postStatus(`/admin/users/${encodeURIComponent(id)}/unban`);
}

export async function listAuditApi(query: ListAuditQuery = {}) {
  const response = await api.get("/admin/audit", { params: query });
  return response.data;
}

export async function getOverviewApi(): Promise<OverviewKpi> {
  const response = await api.get("/admin/overview");
  return response.data;
}

export async function getSeriesApi(name: string, range: "7d" | "30d" | "90d") {
  const response = await api.get(`/admin/series/${name}`, { params: { range } });
  return response.data as SeriesResponse;
}

export async function getSourcesApi(range?: "7d" | "30d" | "90d") {
  const response = await api.get("/admin/sources", {
    params: range ? { range } : {},
  });
  return response.data as SourceBreakdownResponse;
}

export async function getRecentLogsApi(
  service: string,
  limit = 200,
): Promise<RecentLogLine[]> {
  const response = await api.get(`/admin/logs/recent`, {
    params: { service, limit },
  });
  return response.data;
}

export async function postLogTicketApi(
  service: string,
): Promise<LogTicketResponse> {
  const response = await api.post(`/admin/logs/ticket`, { service });
  return response.data;
}

export function streamLogsUrl(service: string, ticket: string): string {
  // env.apiUrl already includes /api/v1 (e.g. "/api/v1" or "http://localhost:3000/api/v1")
  // — append only the path tail, never re-add the prefix.
  const base = env.apiUrl.replace(/\/$/, "");
  return `${base}/admin/logs/stream?service=${encodeURIComponent(service)}&ticket=${encodeURIComponent(ticket)}`;
}
