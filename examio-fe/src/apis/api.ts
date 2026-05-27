import axios, {
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
  AxiosRequestConfig,
} from "axios";
import { getOrCreateDeviceId } from "@/lib/deviceId";
import { MODEL_UNAVAILABLE_MESSAGE } from "@/types/ai";
import {
  setAuthToken,
  clearAuthToken,
  getStoredRefreshToken,
  getStoredSessionId,
  setStoredRefreshToken,
  clearStoredRefreshToken,
  clearStoredSessionId,
} from "@/hooks/useAuthSync";
import { syncRefreshTokenApi } from "@/apis/authApi";
import { env } from "@/lib/env";
import { clearRedirectBackTarget, getCurrentReturnPath, setRedirectBackTarget } from "@/lib/authRedirect";
import { navigateTo } from "@/lib/navigation";

type RetryableRequestConfig = AxiosRequestConfig & {
  _retry?: boolean;
  skipAuthRefresh?: boolean;
};

let refreshPromise: Promise<string | null> | null = null;

function handleAuthFailure() {
  clearAuthToken();
  clearStoredRefreshToken();
  clearStoredSessionId();

  if (typeof window === "undefined") {
    return;
  }

  if (window.location.pathname !== "/login") {
    setRedirectBackTarget(getCurrentReturnPath());
    clearRedirectBackTarget();
    navigateTo("/login", true);
  }
}

export const api = axios.create({
  baseURL: env.apiUrl,
  withCredentials: true,
});

async function refreshAccessToken() {
  if (!refreshPromise) {
    let refreshToken = getStoredRefreshToken();
    const sessionId = getStoredSessionId();

    if (!refreshToken && sessionId) {
      const syncResponse = await syncRefreshTokenApi(sessionId);
      refreshToken = syncResponse.refreshToken || null;
      if (refreshToken) {
        setStoredRefreshToken(refreshToken);
      }
    }

    refreshPromise = api
      .post("/auth/refresh", refreshToken ? { refreshToken } : undefined, {
        skipAuthRefresh: true,
      } as RetryableRequestConfig)
      .then((response) => {
        const token = response.data?.token;
        if (!token) {
          throw new Error("Làm mới phiên đăng nhập thất bại");
        }

        setAuthToken(token);
        if (response.data?.refreshToken) {
          setStoredRefreshToken(response.data.refreshToken);
        }
        return token as string;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

api.interceptors.request.use(authRequestInterceptor);
function authRequestInterceptor(config: InternalAxiosRequestConfig) {
  if (config.headers) {
    const token = localStorage.getItem("auth_token");
    if (token) {
      config.headers.authorization = `Bearer ${token.replace(/"/g, "")}`;
    }

    // Add Device ID header for session tracking
    const deviceId = getOrCreateDeviceId();
    if (deviceId) {
      config.headers["X-Device-ID"] = deviceId;
    }
  }
  return config;
}

api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.skipAuthRefresh
    ) {
      console.warn("[auth-api] interceptor caught 401, attempting refresh");
      try {
        originalRequest._retry = true;
        const newToken = await refreshAccessToken();

        if (newToken && originalRequest.headers) {
          originalRequest.headers.authorization = `Bearer ${newToken}`;
        }

        return api(originalRequest);
      } catch {
        console.error("[auth-api] refresh failed, forcing auth failure");
        handleAuthFailure();
        return Promise.reject(new Error("Phiên đăng nhập đã hết hạn"));
      }
    }

    // Handle session invalidated (logout from another device)
    if (error.response?.status === 401) {
      type SessionErrorData = { code?: string; message?: string };
      const errorData = error.response.data as SessionErrorData;

      if (errorData.code === "SESSION_INVALIDATED") {
        clearAuthToken();
        clearStoredRefreshToken();
        clearStoredSessionId();
        clearRedirectBackTarget();
        setRedirectBackTarget(getCurrentReturnPath());
        alert("Bạn đã bị đăng xuất từ thiết bị khác");
        navigateTo("/login", true);
        return Promise.reject(new Error("Session invalidated"));
      }

      if (errorData.code === "SESSION_EXPIRED") {
        handleAuthFailure();
        return Promise.reject(new Error("Phiên đăng nhập đã hết hạn"));
      }
    }

    if (error.response?.data) {
      type ErrorResponseData = {
        message?: string;
        error?: string;
        detail?: string | { message?: string; code?: string };
      };
      const errorData = error.response.data as ErrorResponseData;

      const detailMessage =
        typeof errorData.detail === "object"
          ? errorData.detail?.message
          : errorData.detail;
      const detailCode =
        typeof errorData.detail === "object" ? errorData.detail?.code : undefined;

      if (
        detailCode === "MODEL_UNAVAILABLE" ||
        detailCode === "MODEL_INSUFFICIENT_VRAM" ||
        detailCode === "MODEL_RUNTIME_ERROR"
      ) {
        console.log("Backend Error:", detailMessage || MODEL_UNAVAILABLE_MESSAGE);
        return Promise.reject(new Error(MODEL_UNAVAILABLE_MESSAGE));
      }

      if (detailMessage) {
        console.log("Backend Error:", detailMessage);
        return Promise.reject(new Error(detailMessage));
      }

      if (errorData.message) {
        console.log("Backend Error:", errorData.message);
        return Promise.reject(new Error(errorData.message));
      }

      if (errorData.error) {
        console.log("Backend Error:", errorData.error);
        return Promise.reject(new Error(errorData.error));
      }
    }
    return Promise.reject(error);
  }
);
