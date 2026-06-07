import { useEffect, useRef, useState } from "react";

export type EventSourceStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

export interface UseEventSourceOptions {
  url: string | null;
  enabled?: boolean;
  withCredentials?: boolean;
  reconnectBackoff?: number[];
  maxRetries?: number;
  onMessage: (event: MessageEvent) => void;
  onError?: (err: unknown) => void;
}

const DEFAULT_BACKOFF = [1000, 2000, 5000, 30000];
const DEFAULT_MAX_RETRIES = 5;

export function useEventSource(options: UseEventSourceOptions) {
  const {
    url,
    enabled = true,
    withCredentials = true,
    reconnectBackoff = DEFAULT_BACKOFF,
    maxRetries = DEFAULT_MAX_RETRIES,
    onMessage,
    onError,
  } = options;

  const [status, setStatus] = useState<EventSourceStatus>("idle");
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  onMessageRef.current = onMessage;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled || !url) {
      setStatus("idle");
      return;
    }

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      setStatus(retryRef.current === 0 ? "connecting" : "reconnecting");

      const es = new EventSource(url, { withCredentials });
      esRef.current = es;

      es.onopen = () => {
        if (cancelled) return;
        retryRef.current = 0;
        setStatus("open");
      };

      es.onmessage = (event) => {
        if (cancelled) return;
        onMessageRef.current(event);
      };

      es.onerror = (event) => {
        if (cancelled) return;
        es.close();
        esRef.current = null;

        if (retryRef.current >= maxRetries) {
          setStatus("closed");
          onErrorRef.current?.(event);
          return;
        }

        const delay =
          reconnectBackoff[
            Math.min(retryRef.current, reconnectBackoff.length - 1)
          ];
        retryRef.current += 1;
        setStatus("reconnecting");
        timerRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setStatus("closed");
    };
  }, [url, enabled, withCredentials, reconnectBackoff, maxRetries]);

  return { status };
}
