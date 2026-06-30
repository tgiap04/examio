import { api } from "./api";
import type { AxiosRequestConfig } from "axios";
import { User } from "@/types/user";

export interface CredentialsLogin {
  credential: string; // can be email or username or phone
  password: string;
  turnstileToken?: string;
}

export interface CredentialsSignup {
  username: string;
  password: string;
  email: string;
  turnstileToken?: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  user?: User;
  token?: string;
  refreshToken?: string;
  sessionId?: string;
  deviceId?: string;
  redirectTo?: string;
}

export interface SignupResponse {
  success: boolean;
  message: string;
  token?: string;
  refreshToken?: string;
  sessionId?: string;
  deviceId?: string;
  user?: User;
  redirectTo?: string;
}

export interface SendCodeResetPassWordCredentials {
  email: string;
}

export interface SendCodeResetPassWordResponse {
  message: string;
}

export interface ResetPasswordCredentials {
  email: string;
  code: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  message: string;
}

export async function loginApi(
  credentials: CredentialsLogin
): Promise<LoginResponse> {
  const response = await api.post("/auth/login", credentials);
  return response.data;
}

export async function signupApi(
  credentials: CredentialsSignup
): Promise<SignupResponse> {
  const response = await api.post("/auth/register", credentials);
  return response.data;
}

export async function sendCodeResetPasswordApi(
  credentials: SendCodeResetPassWordCredentials
): Promise<SendCodeResetPassWordResponse> {
  const response = await api.post(
    "/auth/send-code-reset-password",
    credentials
  );
  return response.data;
}

export async function resetPasswordApi(
  credentials: ResetPasswordCredentials
): Promise<ResetPasswordResponse> {
  const response = await api.post("/auth/reset-password", credentials);
  return response.data;
}

export async function getUserApi(
  forceRefresh = false,
  options: { skipAuthRefresh?: boolean } = {}
): Promise<{ user: User }> {
  const params = forceRefresh ? `?_t=${Date.now()}` : "";
  const response = await api.get(`/auth/me${params}`, {
    skipAuthRefresh: options.skipAuthRefresh,
  } as AxiosRequestConfig & { skipAuthRefresh?: boolean });
  return response.data;
}

export interface VerifyAccountResponse {
  message: string;
}

export async function sendVerificationEmailApi(): Promise<{ message: string }> {
  const response = await api.post("/auth/sendVerificationEmail");
  return response.data;
}

export async function verifyAccountApi(
  code: string
): Promise<VerifyAccountResponse> {
  const response = await api.post("/auth/verifyAccount", { code });
  return response.data;
}

export async function logoutApi(): Promise<{ success: boolean }> {
  const response = await api.post("/auth/logout");
  return response.data;
}

export async function refreshTokenApi(): Promise<LoginResponse> {
  // skipAuthRefresh: đây chính là lời gọi refresh thủ công — không để interceptor
  // 401 tự chạy vòng refresh-rồi-redirect về /login. Khi refresh thất bại, caller
  // (getUser) đã xử lý bằng cách set isAuthenticated=false mà không điều hướng, nên
  // trang public không bị đá về /login khi khách chưa đăng nhập.
  const response = await api.post("/auth/refresh", undefined, {
    skipAuthRefresh: true,
  } as AxiosRequestConfig & { skipAuthRefresh?: boolean });
  return response.data;
}

export async function syncRefreshTokenApi(sessionId?: string): Promise<{ success: boolean; refreshToken?: string }> {
  const response = await api.post("/auth/sync-refresh-token", sessionId ? { sessionId } : undefined);
  return response.data;
}

// ==================== Change Password (Authenticated) ====================

export interface ChangePasswordCredentials {
  code: string;
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  message: string;
}

export async function sendCodeChangePasswordApi(): Promise<{
  message: string;
}> {
  const response = await api.post("/auth/send-code-change-password");
  return response.data;
}

export async function changePasswordApi(
  credentials: ChangePasswordCredentials
): Promise<ChangePasswordResponse> {
  const response = await api.post("/auth/change-password", credentials);
  return response.data;
}
