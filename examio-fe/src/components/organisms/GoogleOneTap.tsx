import { useEffect, useRef } from "react";
import { env } from "@/lib/env";
import { api } from "@/apis/api";
import { useAuthStore } from "@/stores/useAuthStore";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          prompt: (callback?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

export function GoogleOneTap() {
  const initialized = useRef(false);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const initializing = useAuthStore((state) => state.initializing);

  useEffect(() => {
    // SECURITY: "already logged in?" comes from the auth store (hydrated via
    // the httpOnly cookie), never from a localStorage token. Wait until the
    // initial /auth/me check resolves before deciding whether to prompt.
    if (initializing || isAuthenticated || initialized.current) return;
    initialized.current = true;

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: true,
        cancel_on_tap_outside: true,
        itp_support: true,
      });
      window.google?.accounts.id.prompt();
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, [initializing, isAuthenticated]);

  async function handleCredentialResponse(response: { credential: string }) {
    try {
      const result = await api.post(`${env.apiUrl}/auth/google/one-tap`, {
        credential: response.credential,
      });
      // SECURITY: the backend already set the httpOnly auth cookie on this
      // response; never persist result.data.token in localStorage. Reload so
      // the app re-hydrates auth state from the cookie.
      if (result.data?.token) {
        window.location.reload();
      }
    } catch (error) {
      console.error("Google One Tap login failed:", error);
    }
  }

  return null;
}
