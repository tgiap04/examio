"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { usePageConfigStore } from "@/stores/usePageConfigStore";
import { syncRefreshTokenApi } from "@/apis/authApi";
import { env } from "@/lib/env";

const AUTH_COOKIE_NAME = "token";
const AUTH_STORAGE_KEY = "auth_token";
const REFRESH_STORAGE_KEY = "refresh_token";
const SESSION_STORAGE_KEY = "session_id";

/**
 * Helper to delete a cookie
 */
function deleteCookie(name: string) {
  const domain = env.cookieDomain ? `;domain=${env.cookieDomain}` : "";
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/${domain}`;
}

/**
 * Helper to get a cookie value
 */
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? match[2] : null;
}

/**
 * Hook to sync auth token from localStorage to cookie
 * This keeps auth state consistent for browser refreshes and API calls
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

    // Capture tokens delivered via URL (e.g. OAuth callback through the gateway)
    // BEFORE we strip them. The gateway intentionally forwards auth tokens in
    // the query string alongside the httpOnly cookie; without this read, the
    // OAuth flow leaves the user unauthenticated.
    const urlToken = url.searchParams.get("token");
    const urlRefreshToken = url.searchParams.get("refreshToken");
    const urlSessionId = url.searchParams.get("sessionId");

    if (urlToken) {
      setAuthToken(urlToken);
    }
    if (urlRefreshToken) {
      setStoredRefreshToken(urlRefreshToken);
    }
    if (urlSessionId) {
      setStoredSessionId(urlSessionId);
    }

    const hadUnsafeParams = unsafeTokenParams.some((param) =>
      url.searchParams.has(param),
    );
    unsafeTokenParams.forEach((param) => url.searchParams.delete(param));
    if (hadUnsafeParams) {
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }

    const token = localStorage.getItem(AUTH_STORAGE_KEY);
    if (token) {
      const existingCookie = getCookie(AUTH_COOKIE_NAME);
      if (existingCookie) {
        deleteCookie(AUTH_COOKIE_NAME);
      }
    }

    // Always call getUser — it reads auth from httpOnly cookie (via
    // withCredentials) when localStorage is empty (e.g. fresh OAuth flow).
    getUser();

    const storedToken = localStorage.getItem(AUTH_STORAGE_KEY);
    const storedRefreshToken = localStorage.getItem(REFRESH_STORAGE_KEY);
    const storedSessionId = localStorage.getItem(SESSION_STORAGE_KEY);

    if (storedToken && !storedRefreshToken && storedSessionId) {
      void syncRefreshTokenApi(storedSessionId || undefined)
        .then((response) => {
          if (response.refreshToken) {
            setStoredRefreshToken(response.refreshToken);
          }
        })
        .catch((error) => {
          console.error("[auth-sync] sync-refresh-token failed", error);
        });
    } else if (storedToken && !storedRefreshToken) {
      console.warn("[auth-sync] skip sync-refresh-token because session_id is missing");
    }
  }, [getUser]);
}

/**
 * Utility to set token in localStorage and cookie for API headers
 */
export function setAuthToken(token: string) {
  localStorage.setItem(AUTH_STORAGE_KEY, token);
  deleteCookie(AUTH_COOKIE_NAME);
}

/**
 * Utility to clear token from localStorage and cookie
 */
export function clearAuthToken() {
  // Clear localStorage
  localStorage.removeItem(AUTH_STORAGE_KEY);
  // Clear cookie
  deleteCookie(AUTH_COOKIE_NAME);
}

export function setStoredRefreshToken(refreshToken: string) {
  localStorage.setItem(REFRESH_STORAGE_KEY, refreshToken);
}

export function getStoredRefreshToken() {
  return localStorage.getItem(REFRESH_STORAGE_KEY);
}

export function getStoredSessionId() {
  return localStorage.getItem(SESSION_STORAGE_KEY);
}

export function setStoredSessionId(sessionId: string) {
  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
}

export function clearStoredSessionId() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function clearStoredRefreshToken() {
  localStorage.removeItem(REFRESH_STORAGE_KEY);
}
