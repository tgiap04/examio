const RETURN_TO_KEY = "auth_return_to";

const DEFAULT_RETURN_PATH = "/k";
const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

/** True when the string contains an ASCII control character (C0 range or DEL). */
function hasControlCharacter(value: string) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1F || code === 0x7F) return true;
  }
  return false;
}

export function normalizeReturnPath(path?: string | null) {
  if (!path) {
    return DEFAULT_RETURN_PATH;
  }

  const trimmed = path.trim();
  if (!trimmed || trimmed.includes("\\") || hasControlCharacter(trimmed)) {
    return DEFAULT_RETURN_PATH;
  }

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://examio.local";
    const url = new URL(trimmed, base);

    if (url.origin !== base || !url.pathname.startsWith("/") || url.pathname.startsWith("//")) {
      return DEFAULT_RETURN_PATH;
    }

    if (AUTH_PATHS.some((authPath) => url.pathname.startsWith(authPath))) {
      return DEFAULT_RETURN_PATH;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  }
  catch {
    return DEFAULT_RETURN_PATH;
  }
}

export function getCurrentReturnPath() {
  if (typeof window === "undefined") {
    return DEFAULT_RETURN_PATH;
  }

  return normalizeReturnPath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
}

export function setRedirectBackTarget(path?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(RETURN_TO_KEY, normalizeReturnPath(path));
}

export function getRedirectBackTarget() {
  if (typeof window === "undefined") {
    return DEFAULT_RETURN_PATH;
  }

  const stored = window.localStorage.getItem(RETURN_TO_KEY);
  if (!stored) {
    return DEFAULT_RETURN_PATH;
  }

  return normalizeReturnPath(stored);
}

export function clearRedirectBackTarget() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(RETURN_TO_KEY);
}
