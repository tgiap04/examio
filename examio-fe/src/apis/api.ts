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
import { apiErrorAction, errorFailure, refreshFailureAction } from "@/lib/rbac/api-error-policy";
import { toast } from "@/components/antd/toast";
import i18n from "@/lib/i18n";
import type { SessionPayload } from "@/apis/authApi";

type RetryableRequestConfig = AxiosRequestConfig & {
  _retry?: boolean;
  skipAuthRefresh?: boolean;
};

let refreshPromise: Promise<string | null> | null = null;

/** Error carried to callers: keeps the HTTP status and the gateway `code` (the message alone loses them). */
export class ApiRequestError extends Error {
  status?: number;
  code?: string;
  requestId?: string;
}

function toApiError(message: string, error: AxiosError): ApiRequestError {
  const data = error.response?.data as { code?: string; requestId?: string } | undefined;
  const apiError = new ApiRequestError(message);
  apiError.status = error.response?.status;
  apiError.code = data?.code;
  apiError.requestId = data?.requestId;
  return apiError;
}

// The auth store registers itself here (api.ts cannot import it: the store
// imports the API layer, so a direct import would be circular).
export interface AuthBridge {
  applySession: (payload: SessionPayload) => void;
  refetchUser: () => void;
}
let authBridge: AuthBridge | null = null;
export function registerAuthBridge(bridge: AuthBridge): void {
  authBridge = bridge;
}

const REFETCH_COOLDOWN_MS = 5000;
let lastForbiddenRefetchAt = 0;
function refetchUserDebounced() {
  const now = Date.now();
  if (now - lastForbiddenRefetchAt < REFETCH_COOLDOWN_MS) return;
  lastForbiddenRefetchAt = now;
  authBridge?.refetchUser();
}

// Endpoints where the caller has no established session yet — a 401 here means
// bad credentials / an invalid code, NOT an expired access token. Running the
// refresh-and-retry flow for these fails (there is nothing to refresh) and
// masks the real error with a confusing "Phiên đăng nhập đã hết hạn" message
// plus an unwanted redirect to /login. Let their 401 fall through so the
// backend's actual message (e.g. wrong email/password) reaches the UI.
// Only endpoints that are unauthenticated on the backend (no AuthGuard) belong
// here — their 401 means bad credentials / invalid code. Do NOT add
// AuthGuard-protected endpoints (e.g. /auth/verifyAccount, /auth/change-password):
// their 401 means an expired access token and MUST still trigger a refresh.
const PRE_AUTH_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/reset-password",
  "/auth/google/one-tap",
  "/auth/refresh",
];

function isPreAuthRequest(url?: string): boolean {
  if (!url) return false;
  return PRE_AUTH_PATHS.some((path) => url.includes(path));
}

export function handleAuthFailure() {
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

/** Single-flight session refresh, shared by the axios interceptor and the study-room socket. */
export async function refreshAccessToken() {
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
        const data = response.data as Partial<SessionPayload> & { token?: string };
        if (!data?.token) {
          throw new Error("Làm mới phiên đăng nhập thất bại");
        }
        // Apply the new roles/permissions BEFORE the original request is
        // retried, so role-scoped caches are already reset when it resolves.
        if (data.user && data.roles && data.permissions) {
          authBridge?.applySession({
            user: data.user,
            roles: data.roles,
            permissions: data.permissions,
          });
        }
        return data.token;
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

    const status = error.response?.status;
    const errorCode = (error.response?.data as { code?: string } | undefined)?.code;
    const eligible =
      !!originalRequest &&
      !originalRequest.skipAuthRefresh &&
      !isPreAuthRequest(originalRequest.url);

    const action = eligible
      ? apiErrorAction({ status, code: errorCode, retried: !!originalRequest?._retry })
      : "pass-through";

    if (action === "refresh-retry" && originalRequest) {
      console.warn("[auth-api] interceptor caught 401, attempting refresh");
      try {
        originalRequest._retry = true;
        const newToken = await refreshAccessToken();

        if (newToken && originalRequest.headers) {
          originalRequest.headers.authorization = `Bearer ${newToken}`;
        }

        return api(originalRequest);
      } catch (refreshError) {
        // Only the refresh can throw here: the retried request is returned
        // un-awaited, so its own failure (a second 401 -> logout) is handled
        // by its own pass through this interceptor.
        if (refreshFailureAction(errorFailure(refreshError)) === "clear") {
          console.error("[auth-api] refresh rejected, forcing auth failure");
          handleAuthFailure();
          return Promise.reject(new Error("Phiên đăng nhập đã hết hạn"));
        }
        // Transient (429 / 5xx / network): keep the session, surface the error.
        console.warn("[auth-api] refresh failed transiently, keeping session");
        return Promise.reject(refreshError);
      }
    }

    const legacySessionCode = errorCode === "SESSION_INVALIDATED" || errorCode === "SESSION_EXPIRED";
    if (action === "logout" && !legacySessionCode) {
      handleAuthFailure();
      return Promise.reject(new Error("Phiên đăng nhập đã hết hạn"));
    }

    if (action === "toast-refetch") {
      // Same text on the toast and on the rejected error: a caller that toasts
      // `error.message` again is collapsed into this one by the toast deduper.
      const denied = i18n.t("rbac.permissionDenied", { ns: "common" });
      toast.error(denied);
      refetchUserDebounced();
      return Promise.reject(toApiError(denied, error));
    }

    if (action === "verify-redirect") {
      if (typeof window !== "undefined" && window.location.pathname !== "/k/verify") {
        navigateTo("/k/verify", true);
      }
      return Promise.reject(toApiError("Email chưa được xác minh", error));
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
        return Promise.reject(toApiError(MODEL_UNAVAILABLE_MESSAGE, error));
      }

      if (detailMessage) {
        console.log("Backend Error:", detailMessage);
        return Promise.reject(toApiError(detailMessage, error));
      }

      if (errorData.message) {
        console.log("Backend Error:", errorData.message);
        return Promise.reject(toApiError(errorData.message, error));
      }

      if (errorData.error) {
        console.log("Backend Error:", errorData.error);
        return Promise.reject(toApiError(errorData.error, error));
      }
    }
    return Promise.reject(error);
  }
);
