import { api } from "@/apis/api";

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
  activeUsers: number;
  totalRevenue: number;
  pendingPayments: number;
}

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface ListUsersQuery {
  search?: string;
  isAdmin?: boolean;
  isBanned?: boolean;
  page?: number;
  size?: number;
}

export interface ListAuditQuery {
  actorId?: number;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
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
  return response.data as SeriesPoint[];
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

import { env } from "@/lib/env";

export function streamLogsUrl(service: string, ticket: string): string {
  const base = env.apiUrl.replace(/\/$/, "");
  return `${base}/api/v1/admin/logs/stream?service=${encodeURIComponent(service)}&ticket=${encodeURIComponent(ticket)}`;
}
