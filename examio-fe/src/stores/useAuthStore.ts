import { create } from "zustand";
import { User } from "@/types/user";
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
  refreshTokenApi,
  LoginResponse,
  SignupResponse,
} from "@/apis/authApi";
import { toast } from "@/components/antd/toast";
import { clearRedirectBackTarget, getRedirectBackTarget, normalizeReturnPath } from "@/lib/authRedirect";
import { clearUtmSource, encodeUtmState, getUtmSource } from "@/lib/utmSource";
import { env } from "@/lib/env";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  initializing: boolean; // Track initial user check to prevent flash
  login: (credentials: CredentialsLogin) => Promise<LoginResponse>;
  signup: (credentials: CredentialsSignup) => Promise<SignupResponse>;
  sendCodeResetPassword: (
    credentials: SendCodeResetPassWordCredentials,
  ) => Promise<void>;
  resetPassword: (credentials: ResetPasswordCredentials) => Promise<void>;
  logout: () => Promise<void>;
  getUser: () => void;
  refreshSession: () => Promise<string | null>;
  sendVerificationEmail: () => Promise<void>;
  verifyAccount: (code: string) => Promise<void>;
  loginWithGoogle?: () => Promise<void>;
  updateWalletBalance: (newBalance: number) => void;
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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  loading: false,
  initializing: true, // Start as true to prevent flash

  login: async (credentials) => {
    set({ loading: true });
    try {
      const response = await loginApi(credentials);
      if (response.success) {
        set({
          user: response.user,
          isAuthenticated: true,
          initializing: false,
        });
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
        set({
          user: response.user,
          isAuthenticated: true,
          initializing: false,
        });
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
    set({ user: null, isAuthenticated: false });
  },

  refreshSession: async () => {
    try {
      const response = await refreshTokenApi();

      if (!response.success || !response.token) {
        throw new Error(response.message || "Làm mới phiên đăng nhập thất bại");
      }

      // SECURITY: the backend reissues httpOnly cookies on this response;
      // never persist response.token/refreshToken in localStorage.

      set((state) => ({
        user: response.user ?? state.user,
        isAuthenticated: true,
      }));

      return response.token;
    } catch (error) {
      set({ user: null, isAuthenticated: false });
      throw error;
    }
  },

  getUser: async () => {
    if (typeof window === "undefined") {
      return;
    }

    set((state) => ({
      initializing: !state.isAuthenticated,
    }));
    try {
      // Always call /auth/me — it reads the auth token from the httpOnly cookie
      // (set by login/OAuth/refresh) via withCredentials. skipAuthRefresh
      // prevents the 401 handler from triggering an extra /auth/refresh
      // roundtrip on first page load when the user simply isn't signed in.
      const user = await getUserApi(true, { skipAuthRefresh: true });
      if (user) {
        set({ user: user.user, isAuthenticated: true });
      } else {
        set({ user: null, isAuthenticated: false });
      }
    } catch {
      // /auth/me dùng skipAuthRefresh nên 401 không tự refresh. Trước khi coi
      // như đã đăng xuất, thử làm mới phiên một lần bằng refresh token — vá lỗi
      // người dùng bị đăng xuất dù refresh token vẫn còn hợp lệ.
      try {
        const newToken = await refreshTokenApi();
        // SECURITY: the backend reissues httpOnly cookies on this response;
        // never persist newToken.token/refreshToken in localStorage.
        if (newToken?.success && newToken.token && typeof window !== "undefined") {
          const retried = await getUserApi(true, { skipAuthRefresh: true });
          if (retried) {
            set({ user: retried.user, isAuthenticated: true });
            return;
          }
        }
        set({ user: null, isAuthenticated: false });
      } catch {
        set({ user: null, isAuthenticated: false });
      }
    } finally {
      set({ initializing: false });
    }
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

  updateWalletBalance: (newBalance: number) => {
    set((state) => {
      if (state.user && state.user.wallet) {
        return {
          user: {
            ...state.user,
            wallet: {
              ...state.user.wallet,
              balance: newBalance,
            },
          },
        };
      }
      return state;
    });
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
          set({ user: userData.user });
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
