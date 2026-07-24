import { api } from "@/apis/api";

import { env } from "@/lib/env";

// ==================== Types ====================

export interface UserRow {
  id: number;
  email: string;
  username: string;
  name: string;
  avatar: string;
  isAdmin: boolean;
  isBanned: boolean;
  isVerified: boolean;
  createdAt: string;
  walletBalance: number;
}

export interface AuditRow {
  id: string;
  actorId: number;
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
  proCount: number;
  vipCount: number;
  revenue30d: number;
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
  isAdmin?: boolean;
  isBanned?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ListAuditQuery {
  actorId?: number;
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

export interface RefundBody {
  paymentId: string;
  reason: string;
}

export interface CreditBody {
  userId: number;
  amount: number;
  reason: string;
}

export interface SetTierBody {
  userId: number;
  tier: number;
  reason: string;
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

export async function getUserApi(id: number) {
  const response = await api.get(`/admin/users/${id}`);
  return response.data;
}

export async function updateUserApi(id: number, body: UpdateUserBody) {
  const response = await api.patch(`/admin/users/${id}`, body);
  return response.data;
}

export async function banUserApi(id: number) {
  const response = await api.post(`/admin/users/${id}/ban`);
  return response.data;
}

export async function unbanUserApi(id: number) {
  const response = await api.post(`/admin/users/${id}/unban`);
  return response.data;
}

export async function grantAdminApi(id: number) {
  const response = await api.post(`/admin/users/${id}/grant-admin`);
  return response.data;
}

export async function revokeAdminApi(id: number) {
  const response = await api.post(`/admin/users/${id}/revoke-admin`);
  return response.data;
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

export async function refundApi(body: RefundBody) {
  const response = await api.post("/admin/finance/refund", body);
  return response.data;
}

export async function creditApi(body: CreditBody) {
  const response = await api.post("/admin/finance/credit", body);
  return response.data;
}

export async function setTierApi(body: SetTierBody) {
  const response = await api.post("/admin/finance/tier", body);
  return response.data;
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
