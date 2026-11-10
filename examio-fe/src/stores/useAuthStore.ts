import { create } from "zustand";
import { User } from "@/types/user";
import type { Permission, Role } from "@/types/permissions.generated";
import {
  loginApi,
  signupApi,
  sendCodeResetPasswordApi,
  resetPasswordApi,
  CredentialsLogin,
  CredentialsSignup,
  SendCodeResetPassWordCredentials,
  ResetPasswordCredentials,
  getUserApi,
  sendVerificationEmailApi,
  verifyAccountApi,
  logoutApi,
  LoginResponse,
  SignupResponse,
  SessionPayload,
} from "@/apis/authApi";
import { refreshAccessToken, registerAuthBridge } from "@/apis/api";
import { probeSession, singleFlight } from "@/lib/rbac/session-probe";
import { toast } from "@/components/antd/toast";
import { clearRedirectBackTarget, getRedirectBackTarget, normalizeReturnPath } from "@/lib/authRedirect";
import { clearUtmSource, encodeUtmState, getUtmSource } from "@/lib/utmSource";
import { env } from "@/lib/env";

interface AuthState {
  user: User | null;
  /** Server-provided (never decoded client-side, never persisted). */
  roles: Role[];
  permissions: Permission[];
  /** Replaces user + roles + permissions from a login / refresh / me payload. */
  applySession: (payload: Partial<SessionPayload> & { user?: User }) => void;
  isAuthenticated: boolean;
  loading: boolean;
  initializing: boolean; // Track initial user check to prevent flash
  /** The last session probe could not reach the server and no session is in memory. */
  sessionUnavailable: boolean;
  login: (credentials: CredentialsLogin) => Promise<LoginResponse>;
  signup: (credentials: CredentialsSignup) => Promise<SignupResponse>;
  sendCodeResetPassword: (
    credentials: SendCodeResetPassWordCredentials,
  ) => Promise<void>;
  resetPassword: (credentials: ResetPasswordCredentials) => Promise<void>;
  logout: () => Promise<void>;
  getUser: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  verifyAccount: (code: string) => Promise<void>;
  loginWithGoogle?: () => Promise<void>;
}

// Cleared on a role change and on logout so a demoted (or different) user
// never sees cached teacher data. Registered by routes/index.tsx: the store
// module list that must be reset imports this store, so it cannot be imported here.
let roleScopeResetter: (() => void) | null = null;
export function registerRoleScopeResetter(reset: () => void): void {
  roleScopeResetter = reset;
}

function sameRoles(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
}

function getOAuthRedirectPath() {
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "/k";
  const searchParams =
    typeof window !== "undefined" ? window.location.search : "";
  const urlParams = new URLSearchParams(searchParams);

  const fromParam = urlParams.get("from");

  if (fromParam) {
    return normalizeReturnPath(fromParam);
  }

  const authPaths = ["/login", "/register", "/forgot-password", "/reset-password"];

  if (authPaths.some((path) => currentPath.startsWith(path))) {
    return "/k";
  }

  return normalizeReturnPath(currentPath);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  roles: [],
  permissions: [],
  isAuthenticated: false,
  loading: false,
  initializing: true, // Start as true to prevent flash
  sessionUnavailable: false,

  applySession: (payload) => {
    const previous = get();
    const roles = payload.roles ?? previous.roles;
    const rolesChanged =
      previous.isAuthenticated && previous.roles.length > 0 && !sameRoles(previous.roles, roles);
    set({
      user: payload.user ?? previous.user,
      roles,
      permissions: payload.permissions ?? previous.permissions,
      isAuthenticated: true,
      sessionUnavailable: false,
    });
    if (rolesChanged) roleScopeResetter?.();
  },

  login: async (credentials) => {
    set({ loading: true });
    try {
      const response = await loginApi(credentials);
      if (response.success) {
        get().applySession(response);
        set({ initializing: false });
        toast.success("Đăng nhập thành công");

        // SECURITY: auth tokens live in httpOnly cookies set by the backend
        // on this same response; never persist them in localStorage
        // (XSS-exfiltratable).

        const redirectTo = getRedirectBackTarget();
        clearRedirectBackTarget();

        return {
          ...response,
          redirectTo,
        } as typeof response & { redirectTo: string };
      } else {
        toast.error(response.message || "Đăng nhập thất bại");
        console.error(response.message || "Đăng nhập thất bại");
        return Promise.reject(
          new Error(response.message || "Đăng nhập thất bại"),
        );
      }
    } catch (error) {
      toast.error((error as Error).message || "Đăng nhập thất bại");
      console.error("Đăng nhập thất bại:", error);
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  signup: async (credentials) => {
    set({ loading: true });
    try {
      // Gắn nguồn first-touch (nếu có) để quy kết đăng ký.
      const utmSource = getUtmSource() ?? undefined;
      const response = await signupApi({ ...credentials, utmSource });
      if (response.success && response.token) {
        clearUtmSource();
        get().applySession(response);
        set({ initializing: false });
        toast.success(response.message || "Đăng ký thành công");

        // SECURITY: auth tokens live in httpOnly cookies set by the backend
        // on this same response; never persist them in localStorage
        // (XSS-exfiltratable).

        const redirectTo = getRedirectBackTarget();
        clearRedirectBackTarget();

        return {
          ...response,
          redirectTo,
        } as typeof response & { redirectTo: string };
      } else {
        toast.error(response.message || "Đăng ký tài khoản thất bại");
        console.error("Đăng ký tài khoản thất bại");
        return Promise.reject(
          new Error(response.message || "Đăng ký tài khoản thất bại"),
        );
      }
    } catch (error) {
      toast.error(
        (error as Error).message || "Có lỗi xảy ra, vui lòng thử lại!",
      );
      console.error("Có lỗi xảy ra, vui lòng thử lại!:", error);
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  sendCodeResetPassword: async (credentials) => {
    set({ loading: true });
    try {
      const response = await sendCodeResetPasswordApi(credentials);
      if (response.message) {
        toast.success(response.message);
      } else {
        toast.error("Quên mật khẩu thất bại");
        console.error("Quên mật khẩu thất bại");
      }
    } catch (error) {
      toast.error((error as Error).message || "Có lỗi quên mật khẩu");
      console.error("Có lỗi quên mật khẩu:", error);
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  resetPassword: async (credentials) => {
    set({ loading: true });
    try {
      const response = await resetPasswordApi(credentials);
      if (response.message) {
        toast.success(response.message);
      } else {
        toast.error("Đặt lại mật khẩu thất bại");
        console.error("Đặt lại mật khẩu thất bại");
      }
    } catch (error) {
      toast.error((error as Error).message || "Đặt lại mật khẩu thất bại");
      console.error("Đặt lại mật khẩu thất bại:", error);
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    try {
      await logoutApi();
    } catch (error) {
      console.error("Logout API error:", error);
    }
    // SECURITY: no client-side token to clear — logoutApi() above clears the
    // httpOnly cookies server-side.
    roleScopeResetter?.();
    set({ user: null, roles: [], permissions: [], isAuthenticated: false });
  },

  getUser: () => {
    if (typeof window === "undefined") {
      return Promise.resolve();
    }
    return loadUserOnce();
  },

  sendVerificationEmail: async () => {
    set({ loading: true });
    try {
      const response = await sendVerificationEmailApi();
      if (response.message) {
        toast.success(response.message);
      }
    } catch (error) {
      toast.error((error as Error).message || "Gửi email xác minh thất bại");
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  verifyAccount: async (code: string) => {
    set({ loading: true });
    try {
      const response = await verifyAccountApi(code);
      if (response.message) {
        toast.success(response.message);
        // Refresh user data to update isVerified status
        const userData = await getUserApi(true);
        if (userData) {
          get().applySession(userData);
        }
      }
    } catch (error) {
      toast.error((error as Error).message || "Xác minh tài khoản thất bại");
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  loginWithGoogle: async () => {
    const redirectPath = getOAuthRedirectPath();
    const redirect = encodeURIComponent(redirectPath);
    // Đưa utm_source vào OAuth `state` để quy kết user đăng ký qua Google
    // (redirect vẫn đi qua cookie oauth_redirect như cũ — không đụng).
    const utm = getUtmSource();
    const stateParam = utm
      ? `&state=${encodeURIComponent(encodeUtmState(utm))}`
      : "";
    // consume-once: utm đã nằm trong `state` gửi đi → xoá bản local để lần đăng
    // ký sau (email/tài khoản khác cùng trình duyệt) không bị dính nguồn cũ.
    if (utm) clearUtmSource();
    window.location.href = `${env.apiUrl}/auth/google?redirect=${redirect}${stateParam}`;
  },
}));

// SideBar and useAuthSync both call getUser on mount; share one /auth/me (and at
// most one /auth/refresh, via the same single-flight the interceptor uses).
const runLoadUser = singleFlight(async () => {
  const { getState, setState } = useAuthStore;
  setState({ initializing: !getState().isAuthenticated });
  try {
    const outcome = await probeSession({
      // /auth/me reads the httpOnly cookie via withCredentials. skipAuthRefresh
      // keeps the interceptor from refreshing on a signed-out first load; the
      // probe decides whether a refresh is warranted.
      fetchMe: () => getUserApi(true, { skipAuthRefresh: true }),
      refresh: refreshAccessToken,
      apply: (me) => getState().applySession(me),
      clear: () => setState({ user: null, roles: [], permissions: [], isAuthenticated: false }),
    });
    // A transient failure with no session in memory is "unknown", not "signed out".
    setState({ sessionUnavailable: outcome === "unavailable" && !getState().isAuthenticated });
  } finally {
    setState({ initializing: false });
  }
});

function loadUserOnce(): Promise<void> {
  return runLoadUser();
}

registerAuthBridge({
  applySession: (payload) => useAuthStore.getState().applySession(payload),
  refetchUser: () => {
    void useAuthStore.getState().getUser();
  },
});
