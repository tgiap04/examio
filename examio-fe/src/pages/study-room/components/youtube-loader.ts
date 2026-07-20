// Singleton loader cho YouTube IFrame API (không thêm dependency npm).
// Nạp script 1 lần, resolve khi window.YT.Player sẵn sàng.

let apiPromise: Promise<void> | null = null;

export function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as {
    YT?: { Player?: unknown };
    onYouTubeIframeAPIReady?: () => void;
  };
  if (w.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });
  return apiPromise;
}

// Trích videoId / listId từ nhiều dạng URL YouTube.
export function parseYouTube(url: string): {
  videoId?: string;
  listId?: string;
} {
  try {
    const u = new URL(url);
    const listId = u.searchParams.get("list") || undefined;
    let videoId = u.searchParams.get("v") || undefined;
    if (!videoId) {
      if (u.hostname.includes("youtu.be")) {
        videoId = u.pathname.slice(1) || undefined;
      }
      const m = u.pathname.match(/\/(embed|shorts)\/([\w-]+)/);
      if (m) videoId = m[2];
    }
    return { videoId, listId };
  } catch {
    return {};
  }
}
