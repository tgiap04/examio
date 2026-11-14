// Quy kết nguồn đăng ký (first-touch). Bắt ?utm_source lúc vào trang, giữ ở
// localStorage cho tới khi đăng ký, rồi gửi kèm để backend gắn vào User.
// Chỉ ghi lần ĐẦU (first-touch) — lần vào sau không ghi đè.
const KEY = "kmaedu:utm_source";

// Whitelist charset + cap 64 (khớp @db.VarChar(64) + zod BE). Rác → null.
function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return null;
  // "direct" là nhãn nội bộ cho lượt không nguồn → không nhận từ URL.
  if (trimmed.toLowerCase() === "direct") return null;
  return /^[\w.-]+$/.test(trimmed) ? trimmed : null;
}

/** Gọi một lần lúc app load: ghi utm_source nếu URL có VÀ chưa lưu trước đó. */
export function captureUtmSource(): void {
  if (typeof window === "undefined") return;
  try {
    const fromUrl = clean(
      new URLSearchParams(window.location.search).get("utm_source"),
    );
    if (fromUrl && !localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, fromUrl);
    }
  } catch {
    /* localStorage bị chặn (private mode) → bỏ qua, không chặn app */
  }
}

export function getUtmSource(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return clean(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function clearUtmSource(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

/**
 * Đóng gói utm_source vào OAuth `state` (base64url của JSON {utmSource}).
 * Backend guard giữ nguyên payload này rồi nhét thêm nonce; strategy đọc lại.
 */
export function encodeUtmState(utmSource: string): string {
  const json = JSON.stringify({ utmSource });
  return btoa(json)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
