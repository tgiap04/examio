"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { usePageConfigStore } from "@/stores/usePageConfigStore";

// SECURITY: auth tokens live in httpOnly cookies set by the backend; never
// persist them in localStorage (XSS-exfiltratable). This hook only hydrates
// user/session state from the cookie via withCredentials — it never reads or
// writes the token, refresh token, or session id itself.

/**
 * Hook to hydrate auth state from the httpOnly cookie the backend sets on
 * login/register/OAuth/refresh, and to strip any auth tokens the OAuth
 * gateway callback may have appended to the URL query string.
 */
export function useAuthSync() {
  const getUser = useAuthStore((state) => state.getUser);
  const loadPages = usePageConfigStore((state) => state.loadPages);

  useEffect(() => {
    // Nạp cấu hình bật/tắt trang 1 lần, song song với getUser (không polling).
    void loadPages();
  }, [loadPages]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const unsafeTokenParams = ["token", "refreshToken", "sessionId"];

    // The gateway may forward auth tokens in the query string alongside the
    // httpOnly cookie it already sets (e.g. OAuth callback). The cookie is
    // the real credential — strip these from the URL/history immediately
    // without ever reading or persisting their values.
    const hadUnsafeParams = unsafeTokenParams.some((param) =>
      url.searchParams.has(param),
    );
    unsafeTokenParams.forEach((param) => url.searchParams.delete(param));
    if (hadUnsafeParams) {
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }

    // getUser reads auth from the httpOnly cookie via withCredentials.
    getUser();
  }, [getUser]);
}
