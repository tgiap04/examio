const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");

const readEnv = (key: string): string | undefined => {
  const viteValue = import.meta.env[key as keyof ImportMetaEnv];
  if (typeof viteValue === "string" && viteValue.length > 0) {
    return viteValue;
  }

  if (typeof process !== "undefined") {
    const processValue = process.env[key];
    if (typeof processValue === "string" && processValue.length > 0) {
      return processValue;
    }
  }

  return undefined;
};

export const env = {
  apiUrl: trimTrailingSlash(readEnv("VITE_API_URL") ?? readEnv("NEXT_PUBLIC_API_URL") ?? ""),
  turnstileSiteKey: readEnv("VITE_TURNSTILE_SITE_KEY") ?? "",
  measurementId: readEnv("VITE_MEASUREMENT_ID") ?? readEnv("NEXT_PUBLIC_MEASUREMENT_ID") ?? "",
  genAITutorAllowedEmails: readEnv("VITE_GENAI_TUTOR_ALLOWED_EMAILS") ?? readEnv("NEXT_PUBLIC_GENAI_TUTOR_ALLOWED_EMAILS") ?? "",
  /** e.g. ".examio.fayedark.com" — used for cookie domain. Omit/empty = no domain attribute */
  cookieDomain: readEnv("VITE_COOKIE_DOMAIN") ?? readEnv("NEXT_PUBLIC_COOKIE_DOMAIN") ?? "",
};
