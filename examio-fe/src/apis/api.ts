import axios, {
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
  AxiosRequestConfig,
} from "axios";
import { getOrCreateDeviceId } from "@/lib/deviceId";
import { MODEL_UNAVAILABLE_MESSAGE } from "@/types/ai";
import { env } from "@/lib/env";
import { clearRedirectBackTarget, getCurrentReturnPath, setRedirectBackTarget } from "@/lib/authRedirect";
import { navigateTo } from "@/lib/navigation";

type RetryableRequestConfig = AxiosRequestConfig & {
  _retry?: boolean;
  skipAuthRefresh?: boolean;
};

let refreshPromise: Promise<string | null> | null = null;

function handleAuthFailure() {
  // SECURITY: auth tokens live in httpOnly cookies set by the backend; there
  // is nothing to clear on the client. A full-page navigateTo("/login")
  // below remounts the app, which re-hydrates auth state from the (now
  // invalid/cleared) cookie.
  if (typeof window === "undefined") {
    return;
  }

  if (window.location.pathname !== "/login") {
    setRedirectBackTarget(getCurrentReturnPath());
    navigateTo("/login", true);
  }
}

export const api = axios.create({
  baseURL: env.apiUrl,
  withCredentials: true,
});

async function refreshAccessToken() {
  if (!refreshPromise) {
    // SECURITY: the refresh token lives in an httpOnly cookie; the backend
    // reads it from there (cookie-first) and reissues fresh httpOnly cookies
    // on this response via Set-Cookie. We never read/write the token or
    // refresh token from JS — the returned `token` is only used as a
    // success signal for the retried request below.
    refreshPromise = api
      .post("/auth/refresh", undefined, {
        skipAuthRefresh: true,
      } as RetryableRequestConfig)
      .then((response) => {
        const token = response.data?.token;
        if (!token) {
          throw new Error("Làm mới phiên đăng nhập thất bại");
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
    // SECURITY: auth tokens live in httpOnly cookies set by the backend;
    // never persist them in localStorage (XSS-exfiltratable). `withCredentials:
    // true` on the axios instance already sends the cookie with every request.

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
        // SECURITY: no client-side token to clear — the backend invalidates
        // the session/cookie; navigateTo below forces a full reload.
        clearRedirectBackTarget();
        const returnTo = getCurrentReturnPath();
        // Prevent redirect loop if already on login page
        if (returnTo !== "/login") {
          setRedirectBackTarget(returnTo);
        }
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
