import { api } from "./api";
import { env } from "@/lib/env";

export interface PageConfigEntry {
  key: string;
  enabled: boolean;
}

export interface PageConfigResponse {
  pages: PageConfigEntry[];
}

/**
 * Lấy map bật/tắt trang từ server. Trả Record<string, boolean> để tra O(1).
 * Ném lỗi khi network fail — caller nên catch và fail-open (mặc định bật).
 */
export async function fetchPages(): Promise<Record<string, boolean>> {
  const response = await api.get<PageConfigResponse>("/config/pages");
  const entries = response.data.pages ?? [];
  return Object.fromEntries(entries.map((e) => [e.key, e.enabled]));
}

/**
 * Mở SSE tới /config/stream. Emit event `pages-changed` kèm full page-map.
 * Tự reconnect với exponential backoff khi rớt kết nối.
 *
 * @param onPagesChanged gọi với full Record<string,boolean> map mới
 * @returns hàm cleanup — gọi để đóng stream và dừng reconnect
 */
export function openConfigStream(
  onPagesChanged: (map: Record<string, boolean>) => void,
): () => void {
  const baseUrl = env.apiUrl || "/api/v1";
  let aborted = false;
  let retryDelay = 1000;
  const MAX_RETRY_DELAY = 30000;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let activeController: AbortController | null = null;

  async function connect(): Promise<void> {
    if (aborted) return;

    // SECURITY: auth tokens live in httpOnly cookies set by the backend;
    // never persist them in localStorage (XSS-exfiltratable). `credentials:
    // "include"` below sends the cookie with the SSE request.
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
    };

    activeController = new AbortController();

    try {
      const response = await fetch(`${baseUrl}/config/stream`, {
        method: "GET",
        headers,
        credentials: "include",
        signal: activeController.signal,
      });

      if (aborted) return;
      if (!response.ok) {
        throw new Error(`SSE /config/stream responded ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No readable stream body from /config/stream");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEventName = "";

      while (true) {
        if (aborted) {
          reader.cancel();
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith(":")) {
            currentEventName = "";
            continue;
          }
          if (line.startsWith("event:")) {
            currentEventName = line.slice(6).trim();
            continue;
          }
          if (line.startsWith("data:")) {
            const rawData = line.slice(5).trim();
            if (currentEventName === "pages-changed") {
              try {
                const map = JSON.parse(rawData) as Record<string, boolean>;
                onPagesChanged(map);
              } catch {
                // Malformed JSON — bỏ qua, giữ stream
              }
            }
            currentEventName = "";
            continue;
          }
          if (line === "") {
            currentEventName = "";
          }
        }
      }

      // Stream kết thúc sạch — reconnect trừ khi đã abort
      if (!aborted) {
        retryDelay = 1000;
        scheduleReconnect();
      }
    } catch (err: unknown) {
      if (aborted) return;
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (isAbort) return;
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (aborted) return;
    retryTimer = setTimeout(() => {
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
      void connect();
    }, retryDelay);
  }

  void connect();

  return () => {
    aborted = true;
    activeController?.abort();
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };
}
