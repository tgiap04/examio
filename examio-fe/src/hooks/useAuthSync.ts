"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { syncRefreshTokenApi } from "@/apis/authApi";

const AUTH_COOKIE_NAME = "token";
const AUTH_STORAGE_KEY = "auth_token";
const REFRESH_STORAGE_KEY = "refresh_token";
const SESSION_STORAGE_KEY = "session_id";

/**
 * Helper to set a cookie
 */
function setCookie(name: string, value: string, days: number = 7) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);

  const isProduction = window.location.hostname === "kma.fayedark.com";
  const domain = isProduction ? ";domain=.fayedark.com" : "";
  const secure = isProduction ? ";Secure" : "";
  const sameSite = isProduction ? ";SameSite=None" : ";SameSite=Lax";

  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/${domain}${sameSite}${secure}`;
}

/**
 * Helper to delete a cookie
 */
function deleteCookie(name: string) {
  const isProduction =
    typeof window !== "undefined" &&
    window.location.hostname === "kma.fayedark.com";
  const domain = isProduction ? ";domain=.fayedark.com" : "";
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

  useEffect(() => {
    const url = new URL(window.location.href);
    const tokenFromQuery = url.searchParams.get("token");
    const refreshTokenFromQuery = url.searchParams.get("refreshToken");
    const sessionIdFromQuery = url.searchParams.get("sessionId");

    if (tokenFromQuery) {
      setAuthToken(tokenFromQuery);
      url.searchParams.delete("token");
    }

    if (refreshTokenFromQuery) {
      setStoredRefreshToken(refreshTokenFromQuery);
      url.searchParams.delete("refreshToken");
    }

    if (sessionIdFromQuery) {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionIdFromQuery);
      url.searchParams.delete("sessionId");
    }

    if (tokenFromQuery || refreshTokenFromQuery || sessionIdFromQuery) {
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }

    const token = localStorage.getItem(AUTH_STORAGE_KEY);
    if (token) {
      const existingCookie = getCookie(AUTH_COOKIE_NAME);
      if (!existingCookie || existingCookie !== token) {
        setCookie(AUTH_COOKIE_NAME, token);
      }

      getUser();
    } else {
      useAuthStore.setState({
        user: null,
        isAuthenticated: false,
        initializing: false,
      });
    }

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
  // Set in localStorage
  localStorage.setItem(AUTH_STORAGE_KEY, token);
  // Set in cookie for browser refresh compatibility
  setCookie(AUTH_COOKIE_NAME, token);
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
